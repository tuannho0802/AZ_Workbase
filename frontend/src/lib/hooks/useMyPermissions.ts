import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '../api/roles.api';
import { useAuthStore } from '../stores/auth.store';
import { MyPermissionsMap, PermissionScope } from '../types/roles.types';

// [AGENT] OLD CODE (giữ để rollback): const STALE_TIME_MS = 60_000;
// NEW: 30 phút. Admin đổi ma trận quyền -> `permSig` trong /notifications/poll (nhịp 300s) đổi ->
// usePermissionChangeSignal invalidate ['my-permissions'] nên UI vẫn cập nhật đúng lúc; staleTime chỉ còn là lưới đỡ.
// BE vẫn enforce quyền thật ở PermissionGuard nên độ trễ tối đa ~5 phút chỉ ảnh hưởng ẩn/hiện UI.
const STALE_TIME_MS = 30 * 60_000;

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
    // [AGENT] OLD CODE (giữ lại để rollback): refetchOnWindowFocus: true  (quay lại tab -> refetch nếu quá staleTime)
    // NEW: bỏ - từ khi có `permSig` trong poll (poll tự refetch khi quay lại tab), quyền đổi sẽ được báo và invalidate
    // đúng lúc; giữ thêm refetch-on-focus chỉ tốn thêm 1 request mỗi lần quay lại tab.
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
