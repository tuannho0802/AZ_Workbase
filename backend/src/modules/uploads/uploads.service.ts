import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// [AGENT] OLD CODE (giữ để rollback): import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
//   import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// NEW (Mục 12G): nạp lười AWS SDK - xem common/utils/aws-s3-loader.ts
import type { S3Client } from '@aws-sdk/client-s3';
import { loadS3Sdk, loadS3Presigner } from '../../common/utils/aws-s3-loader';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';
import { ALLOWED_IMAGE_TYPES } from './dto/presign-avatar.dto';
import { UpdateUploadLimitsDto } from './dto/update-upload-limits.dto';
import { AuditService } from '../audit/audit.service';
import { buildReadableFileName, buildAttachmentFileName, formatShortDateVN } from '../../common/utils/vietnamese-slug.util';

// TTL (giây) - xem PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md mục 7:
// không set dài "cho chắc", đặc biệt attachment (dữ liệu nhạy cảm).
const PUT_TTL_SECONDS = 300; // 5 phút để browser PUT xong
const AVATAR_GET_TTL_SECONDS = 3600; // 1 giờ - avatar không nhạy cảm
const AVATAR_URL_REUSE_MS = 30 * 60 * 1000; // dùng lại URL đã ký tối đa 30 phút (TTL thật 60 phút)
const AVATAR_URL_CACHE_MAX_ENTRIES = 500;
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

// Nhãn tiếng Việt CÓ DẤU cho các `leave_types.code` mặc định (7 loại seed sẵn
// - xem `CreateLeaveTypes1781500000000`) - đi qua toPascalSlug() khi build
// tên file nên dấu tự bị bỏ (xem buildAttachmentFileName), giữ có dấu ở đây
// chỉ để code dễ đọc/dễ đối chiếu với LEAVE_TYPE_MAP ở FE (nghi-phep/page.tsx).
// ⚠️ CHỈ dùng để đặt tên file cho ĐẸP - KHÔNG phải nguồn xác thực loại phép
// nữa (xem `leave_types` bảng thật trong DB). Code KHÔNG có trong map này
// (vd loại phép tuỳ chỉnh do Admin thêm sau) tự fallback về chính `code`
// (xem `presignAttachmentUpload()` bên dưới) - không throw lỗi.
const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Phép năm',
  sick: 'Nghỉ ốm',
  maternity: 'Thai sản',
  unpaid: 'Không lương',
  compensatory: 'Nghỉ bù',
  meet_client: 'Gặp khách',
  late_arrival: 'Đi trễ',
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  // [AGENT] OLD CODE (giữ để rollback): private readonly s3: S3Client; (khởi tạo ngay trong constructor)
  // NEW (Mục 12G): khởi tạo lười qua getter `s3` bên dưới - không nạp AWS SDK ở cold start.
  private _s3?: S3Client;
  private readonly bucketAvatars: string;
  private readonly bucketLeaveAttachments: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {
    this.bucketAvatars = this.configService.get<string>('B2_BUCKET_AVATARS')!;
    this.bucketLeaveAttachments = this.configService.get<string>('B2_BUCKET_LEAVE_ATTACHMENTS')!;
  }

  private get s3(): S3Client {
    if (!this._s3) {
      const { S3Client } = loadS3Sdk();
      this._s3 = new S3Client({
        region: this.configService.get<string>('B2_REGION'),
        endpoint: this.configService.get<string>('B2_ENDPOINT'),
        // ⚠️ FIX BUG THẬT (root cause của việc `fetch()` presigned GET URL từ
        // FE luôn bị Chrome chặn với `net::ERR_BLOCKED_BY_ORB`, dù `<img src>`
        // load bình thường - xem useCachedImage.ts):
        // `@aws-sdk/client-s3` từ ~v3.729 trở đi MẶC ĐỊNH tự bật
        // "flexible checksums" (`responseChecksumValidation: 'WHEN_SUPPORTED'`),
        // khiến MỌI `GetObjectCommand` được ký tự động thêm
        // `ChecksumMode: 'ENABLED'` -> lộ ra thành query param
        // `x-amz-checksum-mode=ENABLED` trên presigned URL. B2 (S3-compatible,
        // KHÔNG phải AWS thật) không trả đúng CORS header tương ứng cho request
        // có param này khi gọi qua `fetch()`/XHR (chỉ `<img>` tag - không bị
        // trình duyệt enforce CORS - mới load được), nên Cache Storage
        // (`useCachedImage.ts`) không bao giờ `fetch()` thành công, luôn rơi
        // xuống fallback tải thẳng qua `<img>` - tốn băng thông y hệt lúc
        // chưa cache. Tắt hẳn 2 flag này để presigned URL KHÔNG còn param lạ,
        // giữ đúng hành vi S3 GetObject "trần" như trước khi SDK đổi default.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: {
          accessKeyId: this.configService.get<string>('B2_ACCESS_KEY_ID')!,
          secretAccessKey: this.configService.get<string>('B2_SECRET_ACCESS_KEY')!,
        },
      });
    }
    return this._s3;
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

  async updateLimits(dto: UpdateUploadLimitsDto, callerId?: number) {
    // [AUDIT] đọc giới hạn CŨ (đã gộp mặc định) trước khi ghi đè.
    const oldLimits = await this.getLimits();

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
    const newLimits = await this.getLimits();

    if (callerId) {
      this.auditService.logActionAsync(
        callerId,
        'UPDATE_UPLOAD_LIMITS',
        'setting',
        0,
        { ...oldLimits },
        { ...newLimits },
      );
    }
    return newLimits;
  }

  // --- Presign PUT (upload) ---

  /**
   * ⚠️ FIX BUG THẬT (theo yêu cầu): trước đây object key avatar là UUID
   * ngẫu nhiên vô nghĩa (`avatars/{userId}/{uuid}.png`), không đọc/nhận
   * dạng được khi liệt kê media trong trang "Dọn dẹp" - phải bấm vào từng
   * ảnh mới biết của ai. Đổi tên file thành dạng dễ đọc
   * "{TenNhanVien}_{PhongBan}_{Role}.{ext}" (viết liền, không dấu,
   * PascalCase - xem vietnamese-slug.util.ts), vẫn giữ path riêng theo
   * `{userId}/` để 2 nhân viên trùng tên/phòng ban/role tuyệt đối vẫn không
   * đụng key nhau (namespace theo userId).
   *
   * Vì tên file giờ PHỤ THUỘC dữ liệu nhân viên (không random), 2 lần
   * upload avatar liên tiếp của CÙNG 1 người (chưa đổi tên/phòng/role) sẽ
   * ra ĐÚNG 1 key - PUT sau ghi đè PUT trước. `UsersService.updateOwnAvatar`
   * đã tự bỏ qua bước xoá "avatar cũ" khi oldKey === newKey (xem comment ở
   * đó) để không tự xoá nhầm ảnh VỪA upload xong.
   */
  async presignAvatarUpload(userId: number, contentType: string) {
    this.validateContentType(contentType);
    const ext = contentType.split('/')[1];

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['department'],
    });
    // Không throw nếu thiếu user/department (dữ liệu hỏng hiếm gặp) -
    // buildReadableFileName tự fallback "File.{ext}", KHÔNG được để lỗi ở
    // bước đặt tên chặn mất cả luồng upload avatar.
    const fileName = buildReadableFileName([user?.name, user?.department?.name, user?.role], ext);
    const key = `avatars/${userId}/${fileName}`;

    const uploadUrl = await loadS3Presigner().getSignedUrl(
      this.s3,
      new (loadS3Sdk().PutObjectCommand)({ Bucket: this.bucketAvatars, Key: key, ContentType: contentType }),
      { expiresIn: PUT_TTL_SECONDS },
    );
    return { uploadUrl, key };
  }

  /**
   * ⚠️ CẬP NHẬT (theo yêu cầu): object key ảnh đính kèm nghỉ phép trước đây
   * là UUID ngẫu nhiên vô nghĩa (`leave-attachments/{userId}/{uuid}.{ext}`),
   * giờ đổi sang tên dễ đọc CÙNG QUY TẮC với avatar:
   * "{TenNhanVien}_{Role}_{LoaiNghiPhep}_{N}_{Ngay}.{ext}" (VD:
   * "NguyenVanA_Employee_NghiOm_1_8-9-26.png") - xem
   * buildAttachmentFileName trong vietnamese-slug.util.ts.
   *
   * Khác avatar ở 2 điểm bắt buộc phải có N (số thứ tự trong đơn, từ 1) và
   * ngày tạo:
   *  - N: 1 đơn có thể có NHIỀU ảnh (tối đa leaveAttachmentMaxCount) - nếu
   *    không có N, nhiều ảnh CÙNG người/CÙNG loại phép/CÙNG ngày sẽ trùng
   *    key tuyệt đối, ảnh sau ghi đè ảnh trước ngay trên B2 (không giống
   *    avatar - avatar chỉ có 1 ảnh/người nên không cần N).
   *  - Ngày: nhiều đơn nghỉ phép CÙNG loại của CÙNG người ở các THỜI ĐIỂM
   *    khác nhau vẫn cần phân biệt được qua tên file khi liệt kê ở trang
   *    "Dọn dẹp Media" (namespace theo userId không đủ, vì userId + loại +
   *    N=1 của đơn tháng này và đơn tháng trước sẽ giống hệt nhau nếu bỏ
   *    ngày).
   *
   * `leaveType` + `index` do FE gửi lên (xem PresignAttachmentDto) - presign
   * LUÔN xảy ra TRƯỚC khi đơn nghỉ phép thật được tạo (đang điền form), nên
   * không thể lấy 2 giá trị này từ DB, phải tin FE gửi đúng.
   */
  async presignAttachmentUpload(userId: number, contentType: string, leaveType: string, index: number) {
    this.validateContentType(contentType);
    const ext = contentType.split('/')[1];

    const user = await this.userRepository.findOne({ where: { id: userId } });
    // Không throw nếu thiếu user (dữ liệu hỏng hiếm gặp) - buildAttachmentFileName
    // tự fallback "File", KHÔNG được để lỗi ở bước đặt tên chặn mất luồng
    // đính kèm đơn nghỉ phép. `leaveType` không có trong LEAVE_TYPE_LABELS
    // (loại phép tuỳ chỉnh) -> fallback dùng thẳng code, vẫn ra tên file hợp lệ.
    const fileName = buildAttachmentFileName(
      [user?.name, user?.role, LEAVE_TYPE_LABELS[leaveType] || leaveType],
      index,
      formatShortDateVN(new Date()),
      ext,
    );
    const key = `leave-attachments/${userId}/${fileName}`;

    const uploadUrl = await loadS3Presigner().getSignedUrl(
      this.s3,
      new (loadS3Sdk().PutObjectCommand)({ Bucket: this.bucketLeaveAttachments, Key: key, ContentType: contentType }),
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
      const head = await this.s3.send(new (loadS3Sdk().HeadObjectCommand)({ Bucket: bucket, Key: key }));
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

  // [PERF/Fluid CPU] Ký SigV4 mỗi lần gọi tốn CPU (GET /users/me, danh sách user ký hàng chục avatar).
  // Dùng lại URL đã ký trong ~30 phút (URL sống 60 phút, luôn còn >= 30 phút hiệu lực khi trả ra).
  // Cache theo từng instance serverless - mất khi cold start, không sao.
  private readonly avatarUrlCache = new Map<string, { url: string; reuseUntil: number }>();

  async signAvatarGetUrl(key: string): Promise<string> {
    const now = Date.now();
    const hit = this.avatarUrlCache.get(key);
    if (hit && hit.reuseUntil > now) return hit.url;

    // [AGENT] OLD CODE: return loadS3Presigner().getSignedUrl(...) mỗi lần, không cache
    const url = await loadS3Presigner().getSignedUrl(this.s3, new (loadS3Sdk().GetObjectCommand)({ Bucket: this.bucketAvatars, Key: key }), {
      expiresIn: AVATAR_GET_TTL_SECONDS,
    });
    if (this.avatarUrlCache.size >= AVATAR_URL_CACHE_MAX_ENTRIES) this.avatarUrlCache.clear(); // chặn phình bộ nhớ
    this.avatarUrlCache.set(key, { url, reuseUntil: now + AVATAR_URL_REUSE_MS });
    return url;
  }

  /** Bỏ URL đã cache của 1 avatar (đổi/xoá ảnh) để lần sau ký URL mới - tránh trình duyệt giữ ảnh cũ theo URL. */
  invalidateAvatarUrl(key: string | null | undefined) {
    if (key) this.avatarUrlCache.delete(key);
  }

  async signAttachmentGetUrl(key: string): Promise<string> {
    return loadS3Presigner().getSignedUrl(this.s3, new (loadS3Sdk().GetObjectCommand)({ Bucket: this.bucketLeaveAttachments, Key: key }), {
      expiresIn: ATTACHMENT_GET_TTL_SECONDS,
    });
  }

  // --- Xoá object (best-effort, không chặn luồng chính khi lỗi) ---

  async deleteObject(bucket: string, key: string) {
    await this.s3.send(new (loadS3Sdk().DeleteObjectCommand)({ Bucket: bucket, Key: key }));
  }

  async deleteAvatar(key: string) {
    this.invalidateAvatarUrl(key);
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