import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  ) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('B2_REGION'),
      endpoint: this.configService.get<string>('B2_ENDPOINT'),
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

  // --- Delete (chỉ bucket mutable - chặn CỨNG ở service, không chỉ ở FE) ---

  async deleteMedia(bucket: StorageBucketKey, key: string) {
    if (!isMutableBucket(bucket)) {
      // Chặn ở tầng service (không chỉ ẩn nút ở FE) - đây là bucket có DB
      // tham chiếu, xoá sai sẽ để lại avatar/đính kèm vỡ ảnh trong app thật.
      throw new ForbiddenException(
        `Bucket "${bucket}" chỉ xem, không cho xoá qua trang này (object key đang được tham chiếu trong DB)`,
      );
    }
    const bucketName = this.resolveBucketName(bucket);
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    } catch (error) {
      this.logger.error(`Xoá media thất bại: ${bucket}/${key}`, error as Error);
      throw new NotFoundException('Không tìm thấy hoặc không xoá được file này');
    }
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
