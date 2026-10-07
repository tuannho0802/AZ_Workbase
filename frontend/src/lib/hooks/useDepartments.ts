import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { refDataQueryOptions } from '../query-stale';
import { departmentsApi, Department, UpdateDepartmentPayload } from '../api/departments.api';

export const useDepartments = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: departmentsApi.getAll,
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 5 * 60 * 1000
    ...refDataQueryOptions(), // 9D
  });

  return {
    departments: (data as Department[]) ?? [],
    isLoading,
  };
};

function useInvalidateDepartments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['departments'] });
}

export const useCreateDepartment = () => {
  const invalidate = useInvalidateDepartments();
  return useMutation({
    mutationFn: departmentsApi.create,
    onSuccess: invalidate,
  });
};

export const useUpdateDepartment = () => {
  const invalidate = useInvalidateDepartments();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDepartmentPayload }) =>
      departmentsApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeleteDepartment = () => {
  const invalidate = useInvalidateDepartments();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data?: { moveUsersToDepartmentId?: number } }) =>
      departmentsApi.remove(id, data),
    onSuccess: invalidate,
  });
};