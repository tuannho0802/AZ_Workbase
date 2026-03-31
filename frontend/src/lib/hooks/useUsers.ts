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

  console.log("Raw Data from API:", data);
  
  // Xử lý cả trường hợp phân trang và không phân trang
  let users = [];
  if (Array.isArray(data)) {
    users = data;
  } else if (data?.data && Array.isArray(data.data)) {
    users = data.data;
  } else if (data?.users && Array.isArray(data.users)) {
    users = data.users;
  }
  
  console.log("Processed users array:", users);
  console.log("Users length:", users.length);

  return {
    users,
    isLoading
  };
};
