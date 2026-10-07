import { useQuery, type QueryClient } from '@tanstack/react-query';
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
  // Không lọc role → dùng chung key với `users-for-select` (cùng GET /users/all)
  // để 2 hook không gọi API trùng nhau. Có role → key riêng nhưng cùng staleTime.
  const { data, isLoading, refetch } = useQuery({
    queryKey: role ? ['users-list', role] : USERS_FOR_SELECT_KEY,
    queryFn: () => usersApi.getUsersList({ role }),
    staleTime: USERS_FOR_SELECT_STALE_MS,
  });

  // Xử lý cả trường hợp phân trang và không phân trang
  let users = [];
  if (Array.isArray(data)) {
    users = data;
  } else if (data?.data && Array.isArray(data.data)) {
    users = data.data;
  } else if (data?.users && Array.isArray(data.users)) {
    users = data.users;
  }
  


  return {
    users,
    isLoading,
    refetch
  };
};

/**
 * [9C - PLAN_CPU_OPTIMIZATION_ROUND2] Key + staleTime DÙNG CHUNG cho
 * `GET /users/all` ở các chỗ `useQuery({ queryKey: ['users-for-select'] })`.
 * Những chỗ KHÔNG dùng hook (useEffect gọi thẳng) phải đi qua
 * `fetchUsersForSelect()` bên dưới để cùng cache, không tự gọi API riêng.
 */
export const USERS_FOR_SELECT_KEY = ['users-for-select'] as const;
export const USERS_FOR_SELECT_STALE_MS = 5 * 60 * 1000;

export const fetchUsersForSelect = (queryClient: QueryClient) =>
  queryClient.fetchQuery({
    queryKey: USERS_FOR_SELECT_KEY,
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: USERS_FOR_SELECT_STALE_MS,
  });

/**
 * Gọi sau mọi mutation làm đổi danh sách/thuộc tính nhân viên (tạo, sửa,
 * khoá, xoá mềm, khôi phục). Bắt buộc đi kèm việc cache 5 phút ở trên.
 */
export const invalidateUserLists = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: USERS_FOR_SELECT_KEY }),
    queryClient.invalidateQueries({ queryKey: ['users-list'] }),
  ]);
