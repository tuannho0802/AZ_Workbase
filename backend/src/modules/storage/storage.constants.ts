/**
 * "Bucket key" là tên NGẮN dùng trong API/URL (query param, body) - KHÔNG
 * phải tên bucket thật trên B2 (`az-imgs-avatars-workbase`...). Tránh lộ
 * tên bucket thật ra FE/URL, và cho phép đổi tên bucket thật trên B2 sau
 * này mà không phải sửa FE.
 */
export const STORAGE_BUCKET_KEYS = ['avatars', 'leave-attachments', 'media-library'] as const;
export type StorageBucketKey = (typeof STORAGE_BUCKET_KEYS)[number];

/**
 * 2 bucket cũ (avatars, leave-attachments) LUÔN view-only qua trang
 * /storage-img - object key của chúng được tham chiếu trong
 * `users.avatar_url` / `leave_request_attachments.object_key`. Xoá trực
 * tiếp từ đây sẽ để lại DB trỏ tới file đã mất (ảnh vỡ ở nơi khác trong
 * app). Chỉ `media-library` (không bucket nào tham chiếu) mới cho phép
 * xoá/thêm tự do.
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
