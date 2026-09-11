import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customerStatusesApi,
  CustomerStatus,
  CreateCustomerStatusPayload,
  UpdateCustomerStatusPayload,
} from '../api/customer-statuses.api';

const QUERY_KEY = ['customer-statuses'];

export const useCustomerStatuses = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => customerStatusesApi.getAll(),
    staleTime: 60 * 1000,
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
