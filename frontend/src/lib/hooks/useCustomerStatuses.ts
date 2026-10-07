import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customerStatusesApi,
  CustomerStatus,
  CreateCustomerStatusPayload,
  UpdateCustomerStatusPayload,
} from '../api/customer-statuses.api';
import { refDataQueryOptions } from '../query-stale';

const QUERY_KEY = ['customer-statuses'];

/** alwaysFresh: chỉ trang quản trị (inUseCount đếm từ bảng customers - không bump domain nào) */
export const useCustomerStatuses = (opts?: { alwaysFresh?: boolean }) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => customerStatusesApi.getAll(),
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 60 * 1000
    // NEW (Plan CPU Mục 6A): create/update/delete bên dưới đều invalidate QUERY_KEY.
    // [AGENT] OLD CODE (giữ để rollback): staleTime: REFERENCE_DATA_STALE_MS
    ...refDataQueryOptions(opts), // 9D
  });

  return {
    statuses: (data as CustomerStatus[]) ?? [],
    isLoading,
    isError,
    error,
  };
};

function useInvalidateCustomerStatuses() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

export const useCreateCustomerStatus = () => {
  const invalidate = useInvalidateCustomerStatuses();
  return useMutation({
    mutationFn: (data: CreateCustomerStatusPayload) => customerStatusesApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdateCustomerStatus = () => {
  const invalidate = useInvalidateCustomerStatuses();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCustomerStatusPayload }) =>
      customerStatusesApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeleteCustomerStatus = () => {
  const invalidate = useInvalidateCustomerStatuses();
  return useMutation({
    mutationFn: ({ id, fallbackCode }: { id: number; fallbackCode?: string }) =>
      customerStatusesApi.remove(id, fallbackCode),
    onSuccess: invalidate,
  });
};
