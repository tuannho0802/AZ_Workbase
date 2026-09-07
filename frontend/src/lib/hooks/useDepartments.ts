import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, Department } from '../api/departments.api';

export const useDepartments = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: departmentsApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
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
    mutationFn: ({ id, data }: { id: number; data: Partial<Department> }) =>
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