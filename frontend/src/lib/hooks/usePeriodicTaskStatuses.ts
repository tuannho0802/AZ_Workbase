import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  periodicTaskStatusesApi,
  PeriodicTaskStatus,
  CreatePeriodicTaskStatusPayload,
  UpdatePeriodicTaskStatusPayload,
} from '../api/periodic-task-statuses.api';
import { refDataQueryOptions } from '../query-stale';

const QUERY_KEY = ['periodic-task-statuses'];

/**
 * Danh sách BOUNDED (không phân trang, giống customer-statuses/leave-types)
 * - dùng cho cả trang quản trị `/quan-ly-trang-thai-cong-viec` LẪN dropdown
 * "Trạng thái" khi tạo/sửa Công việc định kỳ.
 */
export const usePeriodicTaskStatuses = (opts?: { alwaysFresh?: boolean }) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => periodicTaskStatusesApi.getAll(),
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 60 * 1000
    // NEW (Plan CPU Mục 6A): create/update/delete bên dưới đều invalidate QUERY_KEY (+ ['periodic-tasks'] khi xoá).
    // [AGENT] OLD CODE (giữ để rollback): staleTime: REFERENCE_DATA_STALE_MS
    ...refDataQueryOptions(opts), // 9D
  });

  return {
    statuses: (data as PeriodicTaskStatus[]) ?? [],
    isLoading,
    isError,
    error,
  };
};

function useInvalidatePeriodicTaskStatuses() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    // 1 status bị xoá/đổi có thể kéo theo periodic_tasks.status_id bị
    // reassign hàng loạt ở BE (fallback) - invalidate luôn danh sách Task để
    // FE không hiển thị statusId/Tag cũ đã lỗi thời.
    queryClient.invalidateQueries({ queryKey: ['periodic-tasks'] });
  };
}

export const useCreatePeriodicTaskStatus = () => {
  const invalidate = useInvalidatePeriodicTaskStatuses();
  return useMutation({
    mutationFn: (data: CreatePeriodicTaskStatusPayload) => periodicTaskStatusesApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdatePeriodicTaskStatus = () => {
  const invalidate = useInvalidatePeriodicTaskStatuses();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePeriodicTaskStatusPayload }) =>
      periodicTaskStatusesApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeletePeriodicTaskStatus = () => {
  const invalidate = useInvalidatePeriodicTaskStatuses();
  return useMutation({
    mutationFn: ({ id, fallbackStatusId }: { id: number; fallbackStatusId?: number }) =>
      periodicTaskStatusesApi.remove(id, fallbackStatusId),
    onSuccess: invalidate,
  });
};
