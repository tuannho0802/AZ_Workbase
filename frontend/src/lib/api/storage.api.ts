import axiosInstance from './axios-instance';

// Khớp STORAGE_BUCKET_KEYS ở backend/src/modules/storage/storage.constants.ts -
// "bucket key" NGẮN dùng ở API/URL, KHÔNG PHẢI tên bucket thật trên B2.
export const STORAGE_BUCKET_KEYS = ['avatars', 'leave-attachments', 'media-library'] as const;
export type StorageBucketKey = (typeof STORAGE_BUCKET_KEYS)[number];

export const STORAGE_BUCKET_LABELS: Record<StorageBucketKey, string> = {
  avatars: 'Avatar nhân viên',
  'leave-attachments': 'Đính kèm nghỉ phép',
  'media-library': 'Thư viện ảnh chung',
};

export interface StorageBucketUsage {
  usedBytes: number;
  objectCount: number;
}

export interface StorageUsageCache {
  computedAt: string; // ISO - null nếu chưa từng refresh
  buckets: Record<StorageBucketKey, StorageBucketUsage>;
  totalUsedBytes: number;
}

export interface StorageUsageResponse {
  cache: StorageUsageCache | null;
  softLimitGb: number;
}

export interface StorageMediaItem {
  key: string;
  size: number;
  lastModified: string | null;
  viewUrl: string;
}

export interface StorageMediaPage {
  bucket: StorageBucketKey;
  items: StorageMediaItem[];
  nextCursor: string | null;
  mutable: boolean;
}

export const storageApi = {
  // `storage.view`
  getUsage: async (): Promise<StorageUsageResponse> => {
    const response = await axiosInstance.get<StorageUsageResponse>('/storage/usage');
    return response.data;
  },

  // `storage.manage` - tính lại THẬT ngay lúc gọi (không đợi cron ngoài) -
  // dùng cho nút "Tính lại ngay", đặc biệt cần ở lần đầu bật tính năng khi
  // storage-cron chưa từng chạy (cache rỗng, xem storage-cron.controller.ts).
  refreshUsage: async (): Promise<StorageUsageCache> => {
    const response = await axiosInstance.post<StorageUsageCache>('/storage/usage/refresh');
    return response.data;
  },

  // `storage.manage` - hạn mức MỀM để tính %, KHÔNG chặn upload nếu vượt
  updateSoftLimit: async (softLimitGb: number): Promise<{ softLimitGb: number }> => {
    const response = await axiosInstance.patch<{ softLimitGb: number }>('/storage/usage/limit', { softLimitGb });
    return response.data;
  },

  // `storage.view`
  listMedia: async (bucket: StorageBucketKey, cursor?: string, limit = 50): Promise<StorageMediaPage> => {
    const response = await axiosInstance.get<StorageMediaPage>('/storage/media', {
      params: { bucket, cursor, limit },
    });
    return response.data;
  },

  // `storage.manage` - CHỈ hoạt động thật với bucket media-library
  presignMediaLibraryUpload: async (contentType: string): Promise<{ uploadUrl: string; key: string }> => {
    const response = await axiosInstance.post<{ uploadUrl: string; key: string }>('/storage/media-library/presign', {
      contentType,
    });
    return response.data;
  },

  // `storage.manage` - CHỈ xoá được bucket media-library (2 bucket cũ luôn view-only)
  deleteMedia: async (bucket: StorageBucketKey, key: string): Promise<{ success: true }> => {
    const response = await axiosInstance.delete<{ success: true }>('/storage/media', { data: { bucket, key } });
    return response.data;
  },
};

/** Định dạng bytes -> "12.3 MB" / "1.2 GB" - dùng cho progress bar + danh sách ảnh. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}