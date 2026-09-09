import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Setting } from '../../database/entities/setting.entity';
import { ALLOWED_IMAGE_TYPES } from './dto/presign-avatar.dto';
import { UpdateUploadLimitsDto } from './dto/update-upload-limits.dto';

// TTL (giây) - xem PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md mục 7:
// không set dài "cho chắc", đặc biệt attachment (dữ liệu nhạy cảm).
const PUT_TTL_SECONDS = 300; // 5 phút để browser PUT xong
const AVATAR_GET_TTL_SECONDS = 3600; // 1 giờ - avatar không nhạy cảm
const ATTACHMENT_GET_TTL_SECONDS = 600; // 10 phút - giấy khám bệnh, nhạy cảm

const SETTING_KEYS = {
  avatarMaxSizeKb: 'upload_avatar_max_size_kb',
  leaveAttachmentMaxSizeKb: 'upload_leave_attachment_max_size_kb',
  leaveAttachmentMaxCount: 'upload_leave_attachment_max_count',
} as const;

const DEFAULT_LIMITS = {
  avatarMaxSizeKb: 1024,
  leaveAttachmentMaxSizeKb: 1536,
  leaveAttachmentMaxCount: 5,
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly s3: S3Client;
  private readonly bucketAvatars: string;
  private readonly bucketLeaveAttachments: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('B2_REGION'),
      endpoint: this.configService.get<string>('B2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('B2_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('B2_SECRET_ACCESS_KEY')!,
      },
    });
    this.bucketAvatars = this.configService.get<string>('B2_BUCKET_AVATARS')!;
    this.bucketLeaveAttachments = this.configService.get<string>('B2_BUCKET_LEAVE_ATTACHMENTS')!;
  }

  private validateContentType(contentType: string) {
    if (!ALLOWED_IMAGE_TYPES.includes(contentType as any)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG/PNG/WEBP');
    }
  }

  // --- Cấu hình giới hạn (bảng settings - dynamic, xem uploads.controller.ts) ---

  /** Trả về mặc định nếu chưa seed/DB lỗi - KHÔNG throw để không chặn luồng upload */
  async getLimits() {
    try {
      const rows = await this.settingRepository.find({
        where: [
          { key: SETTING_KEYS.avatarMaxSizeKb },
          { key: SETTING_KEYS.leaveAttachmentMaxSizeKb },
          { key: SETTING_KEYS.leaveAttachmentMaxCount },
        ],
      });
      const map = new Map(rows.map((r) => [r.key, r.value]));
      return {
        avatarMaxSizeKb: Number(map.get(SETTING_KEYS.avatarMaxSizeKb)) || DEFAULT_LIMITS.avatarMaxSizeKb,
        leaveAttachmentMaxSizeKb:
          Number(map.get(SETTING_KEYS.leaveAttachmentMaxSizeKb)) || DEFAULT_LIMITS.leaveAttachmentMaxSizeKb,
        leaveAttachmentMaxCount:
          Number(map.get(SETTING_KEYS.leaveAttachmentMaxCount)) || DEFAULT_LIMITS.leaveAttachmentMaxCount,
      };
    } catch (error) {
      this.logger.warn('Không đọc được settings giới hạn upload, dùng mặc định', error as Error);
      return DEFAULT_LIMITS;
    }
  }

  async updateLimits(dto: UpdateUploadLimitsDto) {
    await Promise.all([
      this.settingRepository.save({ key: SETTING_KEYS.avatarMaxSizeKb, value: String(dto.avatarMaxSizeKb) }),
      this.settingRepository.save({
        key: SETTING_KEYS.leaveAttachmentMaxSizeKb,
        value: String(dto.leaveAttachmentMaxSizeKb),
      }),
      this.settingRepository.save({
        key: SETTING_KEYS.leaveAttachmentMaxCount,
        value: String(dto.leaveAttachmentMaxCount),
      }),
    ]);
    return this.getLimits();
  }

  // --- Presign PUT (upload) ---

  async presignAvatarUpload(userId: number, contentType: string) {
    this.validateContentType(contentType);
    const ext = contentType.split('/')[1];
    const key = `avatars/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucketAvatars, Key: key, ContentType: contentType }),
      { expiresIn: PUT_TTL_SECONDS },
    );
    return { uploadUrl, key };
  }

  async presignAttachmentUpload(userId: number, contentType: string) {
    this.validateContentType(contentType);
    const ext = contentType.split('/')[1];
    const key = `leave-attachments/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucketLeaveAttachments, Key: key, ContentType: contentType }),
      { expiresIn: PUT_TTL_SECONDS },
    );
    return { uploadUrl, key };
  }

  // --- Validate SAU khi upload xong (presigned PUT không tự chặn size ở B2 -
  // xem PLAN mục 5.7) ---

  /**
   * Kiểm tra dung lượng thật của object vừa PUT lên B2 so với giới hạn cấu
   * hình. Ném lỗi + tự xoá object nếu vượt - gọi TRƯỚC khi lưu key vào DB
   * (updateOwnAvatar / create leave request), không để lọt object quá khổ
   * vào hệ thống dù chỉ validate được SAU khi đã tốn băng thông upload.
   */
  async assertUploadedSizeWithinLimit(bucket: string, key: string, maxSizeKb: number) {
    let contentLength: number | undefined;
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      contentLength = head.ContentLength;
    } catch (error) {
      this.logger.warn(`Không đọc được metadata object vừa upload: ${key}`, error as Error);
      throw new BadRequestException('Không xác nhận được file vừa upload, vui lòng thử lại');
    }

    if (contentLength && contentLength > maxSizeKb * 1024) {
      await this.deleteObject(bucket, key).catch(() => undefined);
      throw new BadRequestException(`Ảnh vượt quá dung lượng cho phép (${maxSizeKb}KB)`);
    }
  }

  // --- Presign GET (xem/hiển thị) ---

  async signAvatarGetUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucketAvatars, Key: key }), {
      expiresIn: AVATAR_GET_TTL_SECONDS,
    });
  }

  async signAttachmentGetUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucketLeaveAttachments, Key: key }), {
      expiresIn: ATTACHMENT_GET_TTL_SECONDS,
    });
  }

  // --- Xoá object (best-effort, không chặn luồng chính khi lỗi) ---

  async deleteObject(bucket: string, key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async deleteAvatar(key: string) {
    return this.deleteObject(this.bucketAvatars, key).catch((err) =>
      this.logger.warn(`Không xoá được avatar cũ: ${key}`, err),
    );
  }

  get avatarsBucket() {
    return this.bucketAvatars;
  }

  get leaveAttachmentsBucket() {
    return this.bucketLeaveAttachments;
  }
}
