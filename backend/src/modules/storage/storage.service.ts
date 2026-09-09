import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { ALLOWED_IMAGE_TYPES } from '../uploads/dto/presign-avatar.dto';
import {
  StorageBucketKey,
  STORAGE_BUCKET_KEYS,
  isMutableBucket,
  STORAGE_USAGE_CACHE_SETTING_KEY,
  STORAGE_SOFT_LIMIT_SETTING_KEY,
  DEFAULT_STORAGE_SOFT_LIMIT_GB,
  StorageUsageCache,
  StorageBucketUsage,
} from './storage.constants';

const GET_TTL_SECONDS = 600; // 10 phút - đủ để load thumbnail trong trang, không dài "cho chắc"
const PUT_TTL_SECONDS = 300;
// Class C transaction free tier 2500/ngày (xem research B2) - 1000
// object/lần gọi là mức mặc định của S3 ListObjectsV2, KHÔNG tự ý tăng để
// tránh 1 lần refresh cache tốn quá nhiều request nếu bucket rất lớn.
const LIST_PAGE_SIZE = 1000;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucketNames: Record<StorageBucketKey, string>;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(LeaveRequestAttachment)
    private readonly attachmentRepository: Repository<LeaveRequestAttachment>,
  ) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('B2_REGION'),
      endpoint: this.configService.get<string>('B2_ENDPOINT'),
      // Xem comment đầy đủ ở UploadsService constructor (uploads.service.ts) -
      // 2 service này KHÔNG dùng chung 1 S3Client, nên phải tắt riêng ở CẢ
      // 2 nơi. Thiếu chỗ này là lý do `viewUrl` của trang storage-img (nguồn
      // duy nhất qua StorageService, KHÔNG qua UploadsService) vẫn còn dính
      // `x-amz-checksum-mode=ENABLED` dù đã fix UploadsService - `fetch()`
      // từ useCachedImage.ts vẫn bị ERR_BLOCKED_BY_ORB, cache vẫn không ghi
      // được, băng thông vẫn tốn y như chưa cache.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: this.configService.get<string>('B2_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('B2_SECRET_ACCESS_KEY')!,
      },
    });
    this.bucketNames = {
      avatars: this.configService.get<string>('B2_BUCKET_AVATARS')!,
      'leave-attachments': this.configService.get<string>('B2_BUCKET_LEAVE_ATTACHMENTS')!,
      'media-library': this.configService.get<string>('B2_BUCKET_MEDIA_LIBRARY')!,
    };
  }

  private resolveBucketName(bucket: StorageBucketKey): string {
    const name = this.bucketNames[bucket];
    if (!name) {
      // Thiếu biến môi trường B2_BUCKET_MEDIA_LIBRARY - lỗi cấu hình, không
      // phải lỗi người dùng, nhưng vẫn phải chặn rõ ràng thay vì gọi B2 với
      // bucket rỗng (sẽ ra lỗi khó hiểu hơn nhiều từ SDK).
      throw new BadRequestException(`Bucket "${bucket}" chưa được cấu hình (thiếu biến môi trường)`);
    }
    return name;
  }

  // --- List media (phân trang thật qua B2, KHÔNG cache - cần đúng thời điểm xem) ---

  async listMedia(bucket: StorageBucketKey, cursor: string | undefined, limit: number) {
    const bucketName = this.resolveBucketName(bucket);

    const result = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: limit,
        ContinuationToken: cursor,
      }),
    );

    const items = await Promise.all(
      (result.Contents ?? []).map(async (obj) => ({
        key: obj.Key!,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
        // Ký GET ngay ở đây để FE render thumbnail trực tiếp, không cần gọi
        // thêm request nào khác cho từng item.
        viewUrl: await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: bucketName, Key: obj.Key! }), {
          expiresIn: GET_TTL_SECONDS,
        }),
      })),
    );

    return {
      bucket,
      items,
      nextCursor: result.IsTruncated ? result.NextContinuationToken : null,
      mutable: isMutableBucket(bucket),
    };
  }

  // --- Upload (chỉ media-library - xem storage.constants.ts) ---

  async presignMediaLibraryUpload(contentType: string) {
    if (!ALLOWED_IMAGE_TYPES.includes(contentType as any)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG/PNG/WEBP');
    }
    const bucketName = this.resolveBucketName('media-library');
    const ext = contentType.split('/')[1];
    const key = `media-library/${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: bucketName, Key: key, ContentType: contentType }),
      { expiresIn: PUT_TTL_SECONDS },
    );
    return { uploadUrl, key };
  }

  // --- Delete (xoá THẬT cả 3 bucket - avatars/leave-attachments dọn kèm DB reference) ---

  /**
   * ⚠️ CẬP NHẬT (Media Cleanup - trước đây `avatars`/`leave-attachments`
   * LUÔN bị chặn ForbiddenException, xem lịch sử comment cũ ở dưới nếu cần
   * đối chiếu): giờ cho phép xoá CẢ 3 bucket, nhưng 2 bucket có DB tham
   * chiếu (`avatars`, `leave-attachments`) PHẢI dọn tham chiếu đó TRƯỚC khi
   * xoá object thật trên B2 - nếu không, DB sẽ trỏ tới file đã mất (ảnh vỡ
   * ở trang Hồ sơ nhân viên / đơn nghỉ phép). Thứ tự bắt buộc: dọn DB xong
   * MỚI xoá S3 - nếu xoá S3 trước rồi dọn DB sau mà bước dọn DB lỗi giữa
   * chừng (crash, mất kết nối...), sẽ để lại DB trỏ tới file đã mất - tệ
   * hơn nhiều so với việc lỡ dọn DB nhưng object S3 xoá thất bại (chỉ tốn
   * thêm dung lượng, không có ảnh vỡ hiển thị ra ngoài).
   */
  async deleteMedia(bucket: StorageBucketKey, key: string): Promise<void> {
    if (bucket === 'avatars') {
      // Không throw nếu KHÔNG còn user nào tham chiếu key này (avatar cũ đã
      // mồ côi từ trước, hoặc user đã bị xoá) - vẫn cho xoá file bình
      // thường, đây chính là trường hợp "dọn rác" phổ biến nhất.
      await this.userRepository.update({ avatarUrl: key }, { avatarUrl: null });
    } else if (bucket === 'leave-attachments') {
      await this.attachmentRepository.delete({ objectKey: key });
    }

    const bucketName = this.resolveBucketName(bucket);
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    } catch (error) {
      this.logger.error(`Xoá media thất bại: ${bucket}/${key}`, error as Error);
      throw new NotFoundException('Không tìm thấy hoặc không xoá được file này');
    }
  }

  /**
   * Xoá NHIỀU key cùng lúc (nút "Xoá đã chọn" ở trang Dọn dẹp Media) - xử
   * lý TUẦN TỰ từng key (không Promise.all song song) để 1 lỗi đơn lẻ
   * không làm rối log/DB reference của các key khác, và để không dội quá
   * nhiều request cùng lúc lên B2 (rate limit). Không throw giữa chừng -
   * luôn xử lý hết mảng, trả về danh sách key nào xoá được/lỗi để FE hiển
   * thị đúng kết quả từng dòng.
   */
  async bulkDeleteMedia(
    bucket: StorageBucketKey,
    keys: string[],
  ): Promise<{ succeeded: string[]; failed: { key: string; reason: string }[] }> {
    const succeeded: string[] = [];
    const failed: { key: string; reason: string }[] = [];

    for (const key of keys) {
      try {
        await this.deleteMedia(bucket, key);
        succeeded.push(key);
      } catch (error) {
        failed.push({ key, reason: error instanceof Error ? error.message : 'Lỗi không xác định' });
      }
    }

    return { succeeded, failed };
  }

  // --- Usage stats (CÓ CACHE - xem storage-cron.controller.ts để refresh) ---

  /** Đọc cache đã tính sẵn - KHÔNG tính live. Nếu chưa từng refresh lần nào, trả về rỗng + computedAt null. */
  async getUsageFromCache(): Promise<StorageUsageCache | null> {
    const row = await this.settingRepository.findOne({ where: { key: STORAGE_USAGE_CACHE_SETTING_KEY } });
    if (!row) return null;
    try {
      return JSON.parse(row.value) as StorageUsageCache;
    } catch (error) {
      this.logger.warn('Cache storage_usage_cache bị hỏng JSON, coi như chưa có', error as Error);
      return null;
    }
  }

  async getSoftLimitGb(): Promise<number> {
    const row = await this.settingRepository.findOne({ where: { key: STORAGE_SOFT_LIMIT_SETTING_KEY } });
    const value = row ? Number(row.value) : NaN;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_STORAGE_SOFT_LIMIT_GB;
  }

  async updateSoftLimitGb(gb: number): Promise<number> {
    await this.settingRepository.save({ key: STORAGE_SOFT_LIMIT_SETTING_KEY, value: String(gb) });
    return gb;
  }

  /**
   * Tính THẬT dung lượng cả 3 bucket bằng cách liệt kê TOÀN BỘ object (phân
   * trang tới hết) và cộng dồn Size - B2 không có API trả thẳng tổng dung
   * lượng (đã research kỹ, xem hội thoại 2026-09-08). Chỉ gọi từ
   * `storage-cron.controller.ts` (endpoint nội bộ, dùng CRON_SECRET), KHÔNG
   * gọi trực tiếp từ request của user để tránh tính live tốn Class C
   * transaction mỗi lần ai đó mở trang.
   */
  async refreshUsageCache(): Promise<StorageUsageCache> {
    const buckets = {} as Record<StorageBucketKey, StorageBucketUsage>;
    let totalUsedBytes = 0;

    for (const bucketKey of STORAGE_BUCKET_KEYS) {
      const usage = await this.computeBucketUsage(bucketKey);
      buckets[bucketKey] = usage;
      totalUsedBytes += usage.usedBytes;
    }

    const cache: StorageUsageCache = {
      computedAt: new Date().toISOString(),
      buckets,
      totalUsedBytes,
    };

    await this.settingRepository.save({
      key: STORAGE_USAGE_CACHE_SETTING_KEY,
      value: JSON.stringify(cache),
    });

    return cache;
  }

  private async computeBucketUsage(bucket: StorageBucketKey): Promise<StorageBucketUsage> {
    const bucketName = this.resolveBucketName(bucket);
    let usedBytes = 0;
    let objectCount = 0;
    let continuationToken: string | undefined;

    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          MaxKeys: LIST_PAGE_SIZE,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of page.Contents ?? []) {
        usedBytes += obj.Size ?? 0;
        objectCount += 1;
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return { usedBytes, objectCount };
  }
}