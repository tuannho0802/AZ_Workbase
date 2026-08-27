import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaSourcesApi, MediaSource } from '../api/media-sources.api';

const QUERY_KEY = ['media-sources'];

/** activeOnly=true -> chỉ nguồn chưa khoá (dùng cho dropdown thêm khách hàng) */
export const useMediaSources = (activeOnly = false) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...QUERY_KEY, activeOnly],
    queryFn: () => mediaSourcesApi.getAll(activeOnly),
    staleTime: 5 * 60 * 1000,
  });

  return {
    sources: (data as MediaSource[]) ?? [],
    isLoading,
    isError,
    error,
  };
};

function useInvalidateMediaSources() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

export const useCreateMediaSource = () => {
  const invalidate = useInvalidateMediaSources();
  return useMutation({
    mutationFn: mediaSourcesApi.create,
    onSuccess: invalidate,
  });
};

export const useUpdateMediaSource = () => {
  const invalidate = useInvalidateMediaSources();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; sortOrder?: number } }) =>
      mediaSourcesApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useLockMediaSource = () => {
  const invalidate = useInvalidateMediaSources();
  return useMutation({
    mutationFn: (id: number) => mediaSourcesApi.lock(id),
    onSuccess: invalidate,
  });
};

export const useUnlockMediaSource = () => {
  const invalidate = useInvalidateMediaSources();
  return useMutation({
    mutationFn: (id: number) => mediaSourcesApi.unlock(id),
    onSuccess: invalidate,
  });
};

export const useDeleteMediaSource = () => {
  const invalidate = useInvalidateMediaSources();
  return useMutation({
    mutationFn: (id: number) => mediaSourcesApi.remove(id),
    onSuccess: invalidate,
  });
};
