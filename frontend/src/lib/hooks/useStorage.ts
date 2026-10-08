import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storageApi, StorageBucketKey } from '../api/storage.api';
import { putFileToPresignedUrl } from '../api/uploads.api';
import { bumpDomainNonce } from '../api/ref-cache-version';
import { refDataQueryOptions } from '../query-stale';

const USAGE_QUERY_KEY = ['storage-usage'];
const mediaQueryKey = (bucket: StorageBucketKey) => ['storage-media', bucket];

// Cache dung lượng chỉ refresh qua cron (15-30 phút/lần - xem
// storage-cron.controller.ts), nên staleTime dài hơn hẳn các query khác
// trong app: F5 liên tục cũng không ra số mới hơn, gọi lại chỉ tốn API.
// [AGENT] NEW: HTTP cache `?v=` (domain `storage`, đổi khi bảng settings đổi) + refSig -> staleTime dài (2 giờ, như danh mục).
// "Làm mới" thủ công đổi khoá trước nên KHÔNG dính bản trong HTTP cache.
const MEDIA_STALE_TIME_MS = 10 * 60 * 1000; // danh sách file trên B2 không có bảng nào phát tín hiệu đổi -> BE cache 10 phút

export function useStorageUsage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: storageApi.getUsage,
    ...refDataQueryOptions(),
  });

  const refetchFresh = (...args: Parameters<typeof refetch>) => {
    bumpDomainNonce('storage');
    return refetch(...args);
  };

  return { usage: data, isLoading, isError, refetch: refetchFresh };
}

export function useUpdateStorageLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (softLimitGb: number) => storageApi.updateSoftLimit(softLimitGb),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
  });
}

/** Tính lại THẬT dung lượng B2 ngay lúc gọi (Class C transaction) - chỉ Admin bấm tay, không tự động. */
export function useRefreshStorageUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => storageApi.refreshUsage(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
  });
}

/** Danh sách media phân trang theo cursor (ContinuationToken thật của B2) - "Tải thêm", không infinite-scroll tự động. */
export function useStorageMedia(bucket: StorageBucketKey) {
  const query = useInfiniteQuery({
    queryKey: mediaQueryKey(bucket),
    queryFn: ({ pageParam }) => storageApi.listMedia(bucket, pageParam as string | undefined, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: MEDIA_STALE_TIME_MS,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const mutable = query.data?.pages[0]?.mutable ?? false;

  return { ...query, items, mutable };
}

export function useDeleteMedia(bucket: StorageBucketKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => storageApi.deleteMedia(bucket, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaQueryKey(bucket) });
      // Xoá xong dung lượng thay đổi thật, nhưng cache usage chỉ refresh qua
      // cron - KHÔNG invalidate USAGE_QUERY_KEY ở đây để tránh gây hiểu lầm
      // "số cập nhật ngay", giữ đúng UX "hạn mức mềm, không real-time".
    },
  });
}

/** Xoá nhiều key cùng lúc (trang "Dọn dẹp Media") - dùng cho avatars/leave-attachments. */
export function useBulkDeleteMedia(bucket: StorageBucketKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => storageApi.bulkDeleteMedia(bucket, keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaQueryKey(bucket) });
    },
  });
}

/** Chỉ dùng cho bucket media-library (2 bucket cũ view-only, BE tự chặn nếu gọi sai). */
export function useUploadMediaLibraryImage() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, File>({
    mutationFn: async (file: File) => {
      const { uploadUrl, key } = await storageApi.presignMediaLibraryUpload(file.type);
      await putFileToPresignedUrl(uploadUrl, file, file.type);
      return key;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaQueryKey('media-library') });
    },
  });
}