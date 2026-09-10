import { useMemo } from 'react';
import { useRoles } from './useRoles';
import { resolveEntityColor } from '../utils/entityColor';

/**
 * Thay thế các map `ROLE_COLOR`/`roleColor` từng bị hardcode rải rác (layout.tsx,
 * users/page.tsx, users/TrashTab.tsx, profile/page.tsx, audit-logs/page.tsx,
 * SalesUserSelect.tsx...) - giờ đọc ĐÚNG màu Admin đã cấu hình cho từng Role
 * qua trang /phan-quyen (cột `roles.color`, xem migration
 * AddColorToRbacGroupingTables1781300000000) thay vì 1 bảng màu cố định trong
 * code. Role tuỳ chỉnh (không nằm trong 4 role hệ thống cũ) giờ cũng tự động
 * có màu riêng, không còn rơi vào `'default'` xám xịt như trước.
 *
 * Dùng chung `useRoles()` (đã cache 30s qua React Query) - gọi hook này ở
 * nhiều nơi trong cùng 1 lượt render KHÔNG tạo thêm request nào.
 */
export function useRoleColorMap() {
  const { roles, isLoading } = useRoles();

  const roleColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roles) {
      map.set(role.code, resolveEntityColor(role.color));
    }
    return map;
  }, [roles]);

  const getRoleColor = (code?: string | null): string =>
    (code && roleColorMap.get(code)) || resolveEntityColor(undefined);

  return { roleColorMap, getRoleColor, isLoading };
}
