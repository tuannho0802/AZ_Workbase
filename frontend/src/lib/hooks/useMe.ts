import { useQuery } from '@tanstack/react-query';
import { usersApi, UserDetail } from '../api/users.api';

const ME_KEY = ['users', 'me'];

/**
 * Hồ sơ ĐẦY ĐỦ của chính user đang đăng nhập (GET /users/me) - bao gồm
 * `department`/`position` với `{id, name}` chính xác nhất tại thời điểm gọi.
 *
 * ⚠️ KHÁC với `useAuthStore().user`: field đó chỉ được set 1 LẦN lúc login
 * (persist qua cookie) - riêng `position` CHƯA BAO GIỜ được merge lại bởi
 * vòng tự-lành định kỳ ở `(dashboard)/layout.tsx` (hàm đó CHỈ merge
 * avatarUrl/avatarKey/isRootAdmin, xem JSDoc ở đó), nên `user.position` từ
 * authStore có thể cũ/thiếu nếu user vừa được Admin gán Vị trí sau lúc đăng
 * nhập. Dùng hook này ở bất kỳ nơi nào cần hiển thị Vị trí chính xác NGAY
 * (vd Trang chủ, Profile) thay vì đọc trực tiếp từ authStore.
 */
export function useMe() {
  const { data, isLoading } = useQuery<UserDetail>({
    queryKey: ME_KEY,
    queryFn: usersApi.getMe,
    staleTime: 60 * 1000, // 1 phút - đủ mới cho hiển thị, không gọi API quá dày
  });

  return { me: data, isLoading };
}
