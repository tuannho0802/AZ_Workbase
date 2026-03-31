import { useQuery } from '@tanstack/react-query';
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
