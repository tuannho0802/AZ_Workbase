import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '../api/roles.api';
import { useAuthStore } from '../stores/auth.store';
import { MyPermissionsMap, PermissionScope } from '../types/roles.types';

// 60s: đủ để UI cập nhật trong thời gian ngắn sau khi Admin đổi ma trận
// quyền ở trang "Phân quyền" (không cần user tự F5), nhưng không gọi API
// liên tục. Cùng triết lý với useSidebarBadgeCounts.ts.
const STALE_TIME_MS = 60_000;

export interface UseMyPermissionsResult {
  /** true nếu role hiện tại CÓ permission này (bất kể scope là gì). */
  can: (permissionKey: string) => boolean;
  /** Scope hiện tại của permission (own/department/all), null nếu quyền
   * không hỗ trợ scope HOẶC role không có quyền này. Dùng khi 1 nơi cần
   * biết CHÍNH XÁC phạm vi, không chỉ có/không (vd tự quyết định query filter
   * ở FE nếu cần - dù phần lọc dữ liệu thật luôn nằm ở BE). */
  scope: (permissionKey: string) => PermissionScope | null;
  permissions: MyPermissionsMap | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook DUY NHẤT toàn app dùng để quyết định "user hiện tại có được thấy/làm
 * X không" cho MỌI phần UI đã migrate sang hệ thống Permission tuỳ chỉnh
 * (khác các phần CHƯA migrate - vẫn dùng `roles: string[]` tĩnh trong
 * nav-config.tsx như trước, xem giải thích ở đó).
 *
 * ⚠️ NGUYÊN TẮC "API và UI đồng bộ": hook này gọi ĐÚNG endpoint
 * `GET /roles/my-permissions` mà PermissionGuard ở BE dùng để enforce -
 * không hardcode danh sách permission nào ở FE. Khi Admin đổi ma trận quyền
 * qua trang "Phân quyền", lần fetch tiếp theo (tối đa STALE_TIME_MS) UI sẽ
 * tự ẩn/hiện đúng theo, KHÔNG cần deploy lại FE.
 */
export function useMyPermissions(): UseMyPermissionsResult {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const query = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => rolesApi.getMyPermissions(),
    enabled: isAuthenticated,
    staleTime: STALE_TIME_MS,
  });

  const permissions = query.data;

  return {
    can: (permissionKey: string) => !!permissions && permissionKey in permissions,
    scope: (permissionKey: string) => permissions?.[permissionKey] ?? null,
    permissions,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
