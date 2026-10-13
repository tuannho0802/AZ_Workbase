import { useQuery, QueryClient } from '@tanstack/react-query';
import { usersApi, UserDetail } from '../api/users.api';

export const ME_KEY = ['users', 'me'];

/**
 * Tuổi tối đa của cache `/users/me` (chứa `avatarUrl` là Presigned URL).
 * Ngân sách: BE tái dùng URL đã ký tối đa 30 phút (`AVATAR_URL_REUSE_MS`), TTL thật 60 phút
 * -> 30 (BE) + 15 (cache FE) + 8 (nhịp vòng tự-lành ở layout) = 53 < 60. KHÔNG nâng quá 20 phút
 * mà không đổi `AVATAR_URL_REUSE_MS` ở `uploads.service.ts`.
 */
export const ME_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 4] MỘT nguồn duy nhất cho `GET /users/me` (trước đây 3 nơi gọi độc lập:
 * layout, useMe, profile). `fetchQuery` dùng lại cache nếu dữ liệu còn mới hơn `maxAgeMs`, nếu không mới gọi API
 * (và ghi lại vào cache để mọi nơi khác cùng dùng).
 */
export function fetchMeCached(queryClient: QueryClient, maxAgeMs: number): Promise<UserDetail> {
  return queryClient.fetchQuery<UserDetail>({ queryKey: ME_KEY, queryFn: usersApi.getMe, staleTime: maxAgeMs });
}

/** Luôn gọi API (bỏ qua cache) - dùng ngay SAU khi chính user vừa sửa hồ sơ; kết quả mới ghi vào cache chung. */
export function refreshMe(queryClient: QueryClient): Promise<UserDetail> {
  return fetchMeCached(queryClient, 0);
}

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
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 60 * 1000
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 5 * 60 * 1000
    // NEW: 30 phút (đã có tín hiệu invalidate bên dưới). Sau khi chính user sửa hồ sơ/avatar -> `refreshMe`/invalidate(['users']); Admin đổi quyền/vị trí
    // -> `usePermissionChangeSignal` invalidate ME_KEY.
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 30 * 60 * 1000 (30 + 30 + 8 phút có thể vượt TTL 60 phút của URL avatar)
    staleTime: ME_MAX_AGE_MS,
  });

  return { me: data, isLoading };
}
