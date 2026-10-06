import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SIDEBAR_BADGES_QUERY_KEY } from './useSidebarBadgeCounts';
import { ME_KEY } from './useMe';

/**
 * Nhận tín hiệu "quyền của tôi vừa đổi" từ `/notifications/poll` (field `permSig`, xem
 * PermissionsVersionService ở BE) và làm mới NGAY các query phụ thuộc quyền, thay vì chờ hết
 * staleTime hoặc chờ user chuyển trang.
 *
 * - Lần đầu thấy `permSig` của phiên: chỉ ghi nhớ mốc (quyền vừa được tải lúc mount).
 * - Các lần sau: khác mốc -> invalidate (query đang được dùng sẽ refetch ngay).
 * - Đổi user đăng nhập -> đặt lại mốc, KHÔNG coi là "quyền đổi".
 * - BE cũ chưa trả `permSig` (undefined) -> bỏ qua, hành vi như trước.
 *
 * Gọi ĐÚNG 1 LẦN (trong `useNotificationPoll`).
 */
export function usePermissionChangeSignal(permSig: string | undefined, userId: number | undefined) {
  const queryClient = useQueryClient();
  const baseline = useRef<{ userId: number | undefined; sig: string | undefined }>({
    userId: undefined,
    sig: undefined,
  });

  useEffect(() => {
    if (permSig === undefined) return;

    const prev = baseline.current;
    baseline.current = { userId, sig: permSig };

    if (prev.sig === undefined || prev.userId !== userId || prev.sig === permSig) return;

    // Ma trận quyền + ẩn/hiện UI (prefix match -> mọi `resource`).
    queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
    queryClient.invalidateQueries({ queryKey: ['ui-visibility-my-hidden'] });
    // Số đếm sidebar phụ thuộc quyền (badge nào hiện/ẩn).
    queryClient.invalidateQueries({ queryKey: SIDEBAR_BADGES_QUERY_KEY });
    // Role/Phòng ban/Vị trí nằm trong `/users/me` (Plan CPU Mục 4: cache dài hơn nên phải làm mới theo tín hiệu).
    queryClient.invalidateQueries({ queryKey: ME_KEY });
  }, [permSig, userId, queryClient]);
}
