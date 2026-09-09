/**
 * "Bucket key" là tên NGẮN dùng trong API/URL (query param, body) - KHÔNG
 * phải tên bucket thật trên B2 (`az-imgs-avatars-workbase`...). Tránh lộ
 * tên bucket thật ra FE/URL, và cho phép đổi tên bucket thật trên B2 sau
 * này mà không phải sửa FE.
 */
export const STORAGE_BUCKET_KEYS = ['avatars', 'leave-attachments', 'media-library'] as const;
export type StorageBucketKey = (typeof STORAGE_BUCKET_KEYS)[number];

/**
 * ⚠️ CẬP NHẬT (Media Cleanup): trước đây `MUTABLE_BUCKET_KEYS` gộp chung 2
 * ý nghĩa "cho upload tự do" VÀ "cho xoá tự do" - giờ TÁCH RIÊNG:
 *  - Upload tự do qua trang Storage: VẪN chỉ `media-library` (avatars/
 *    leave-attachments upload qua luồng riêng ở uploads.service.ts, gắn
 *    liền với nghiệp vụ profile/đơn nghỉ phép, không phải upload tự do).
 *  - XOÁ: giờ cho phép CẢ 3 bucket (StorageService.deleteMedia) - nhưng
 *    avatars/leave-attachments xoá qua đường "an toàn": tự dọn luôn tham
 *    chiếu DB (users.avatar_url / leave_request_attachments) trước khi xoá
 *    object thật trên B2, để không để lại ảnh vỡ ở nơi khác trong app. Xem
 *    StorageService.deleteMedia() để hiểu chi tiết từng bucket.
 */
export const MUTABLE_BUCKET_KEYS: StorageBucketKey[] = ['media-library'];

export function isMutableBucket(bucket: StorageBucketKey): boolean {
  return MUTABLE_BUCKET_KEYS.includes(bucket);
}

/** Key setting lưu cache tổng dung lượng đã tính (bảng settings, value = JSON.stringify(StorageUsageCache)) */
export const STORAGE_USAGE_CACHE_SETTING_KEY = 'storage_usage_cache';
export const STORAGE_SOFT_LIMIT_SETTING_KEY = 'storage_soft_limit_gb';
export const DEFAULT_STORAGE_SOFT_LIMIT_GB = 50;

export interface StorageBucketUsage {
  usedBytes: number;
  objectCount: number;
}

export interface StorageUsageCache {
  computedAt: string; // ISO timestamp - để FE hiển thị "cập nhật lúc..."
  buckets: Record<StorageBucketKey, StorageBucketUsage>;
  totalUsedBytes: number;
}