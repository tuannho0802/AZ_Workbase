import { useQuery } from '@tanstack/react-query';
import axiosInstance from '../api/axios-instance';
import { usersApi } from '../api/users.api';

export const useUsers = (role?: string) => {
  return useQuery({
    queryKey: ['users', role],
    queryFn: async () => {
      const res = await axiosInstance.get('/users', { params: { role } });
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useUsersList = (role?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ['users-list', role],
    queryFn: () => usersApi.getUsersList({ role }),
    staleTime: 10 * 60 * 1000,
  });

  return {
    users: (data as any[]) ?? [],
    isLoading
  };
};
