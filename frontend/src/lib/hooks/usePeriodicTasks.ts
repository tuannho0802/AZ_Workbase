import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  periodicTasksApi,
  PeriodicTaskFilterParams,
  CreatePeriodicTaskPayload,
  UpdatePeriodicTaskPayload,
} from '../api/periodic-tasks.api';

const LIST_KEY = 'periodic-tasks';

/** Danh sách phân trang SERVER-SIDE (mirror `useCustomers.ts`) - RBAC
 * view/edit đã được BE tự lọc theo scope (own/department/all) qua
 * `PeriodicTaskAccessHelper`, FE không cần tự lọc lại. */
export const usePeriodicTasks = (params: PeriodicTaskFilterParams) => {
  return useQuery({
    queryKey: [LIST_KEY, params],
    queryFn: () => periodicTasksApi.getAll(params),
    placeholderData: keepPreviousData,
  });
};

export const usePeriodicTask = (id: number | null) => {
  return useQuery({
    queryKey: [LIST_KEY, 'detail', id],
    queryFn: () => periodicTasksApi.getOne(id as number),
    enabled: id != null,
  });
};

function useInvalidatePeriodicTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

export const useCreatePeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: (data: CreatePeriodicTaskPayload) => periodicTasksApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdatePeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePeriodicTaskPayload }) =>
      periodicTasksApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeletePeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: (id: number) => periodicTasksApi.remove(id),
    onSuccess: invalidate,
  });
};
