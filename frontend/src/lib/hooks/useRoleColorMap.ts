import { useMemo } from 'react';
import { resolveEntityColor } from '../utils/entityColor';
import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '../api/roles.api';

const ROLE_COLORS_KEY = ['roles', 'colors'];

// ⚠️ MỚI (2026-09-10, fix bug 403 khi Employee đăng nhập) - dùng route
// KHÔNG cần `roles.view` (GET /roles/colors) thay vì `useRoles()` (GET
// /roles, đòi `roles.view`, Employee/Assistant không có). Xem JSDoc đầy đủ ở
// roles.controller.ts#getAllRoleColors và roles.api.ts#getAllRoleColors.
export function useRoleColors() {
  const { data, isLoading } = useQuery({
    queryKey: ROLE_COLORS_KEY,
    queryFn: () => rolesApi.getAllRoleColors(),
    staleTime: 30 * 1000,
  });

  return { roleColors: data ?? [], isLoading };
}

/**
 * Thay thế các map `ROLE_COLOR`/`roleColor` từng bị hardcode rải rác (layout.tsx,
 * users/page.tsx, users/TrashTab.tsx, profile/page.tsx, audit-logs/page.tsx,
 * SalesUserSelect.tsx...) - giờ đọc ĐÚNG màu Admin đã cấu hình cho từng Role
 * qua trang /phan-quyen (cột `roles.color`, xem migration
 * AddColorToRbacGroupingTables1781300000000) thay vì 1 bảng màu cố định trong
 * code. Role tuỳ chỉnh (không nằm trong 4 role hệ thống cũ) giờ cũng tự động
 * có màu riêng, không còn rơi vào `'default'` xám xịt như trước.
 *
 * ⚠️ FIX BUG THẬT (2026-09-10): TRƯỚC ĐÂY dùng `useRoles()` (GET /roles) -
 * route này đòi `roles.view`, nên Employee/Assistant đăng nhập vào BẤT KỲ
 * trang nào có gọi hook này (layout.tsx chạy ở MỌI trang, cộng thêm
 * SalesUserSelect/CustomerInfoTab/customers/page.tsx ở trang Khách hàng) đều
 * nhận 403 "Bạn không có quyền thực hiện hành động này" kèm toast lỗi đỏ tự
 * động hiện lên (axios-instance.ts interceptor gọi `message.error()` cho MỌI
 * lỗi non-401), dù người dùng chẳng bấm gì. Giờ dùng `useRoleColors()` (GET
 * /roles/colors) - route KHÔNG cần `roles.view`, chỉ cần đăng nhập, chỉ trả
 * đúng field an toàn (id/code/name/color), không lộ ma trận permission.
 */
export function useRoleColorMap() {
  const { roleColors, isLoading } = useRoleColors();

  const roleColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roleColors) {
      map.set(role.code, resolveEntityColor(role.color));
    }
    return map;
  }, [roleColors]);

  const getRoleColor = (code?: string | null): string =>
    (code && roleColorMap.get(code)) || resolveEntityColor(undefined);

  return { roleColorMap, getRoleColor, isLoading };
}