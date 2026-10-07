import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Domain (khớp `REF_DATA_DOMAINS` ở BE - permissions-version.service.ts) -> khoá React Query cần làm mới khi domain đó đổi.
 * invalidate khớp TIỀN TỐ: ['roles'] phủ cả ['roles','colors']; ['media-sources'] phủ mọi biến thể activeOnly.
 */
export const REF_DATA_QUERY_KEYS: Readonly<Record<string, readonly (readonly string[])[]>> = {
    departments: [['departments']],
    positions: [['positions']],
    roles: [['roles']],
    customer_statuses: [['customer-statuses']],
    periodic_task_statuses: [['periodic-task-statuses']],
    leave_types: [['leave-types']],
    media_sources: [['media-sources']],
};

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - 9D] Nhận `refSig` từ `/notifications/poll` (phiên bản từng danh mục ít đổi) và làm mới ĐÚNG
 * danh mục vừa đổi - thay cho việc hỏi lại định kỳ. Cùng kiểu `usePermissionChangeSignal`.
 *
 * - Lần đầu thấy `refSig` của phiên: chỉ ghi nhớ mốc (dữ liệu vừa được tải lúc mount), KHÔNG invalidate.
 * - Các lần sau: domain nào có số khác mốc -> chỉ invalidate khoá của domain đó (query đang dùng refetch ngay, query không dùng
 *   được đánh dấu cũ và tải lại khi mở trang).
 * - Đổi user đăng nhập -> đặt lại mốc, KHÔNG coi là "danh mục đổi".
 * - BE cũ chưa trả `refSig` (undefined) hoặc 1 lần poll không đọc được -> bỏ qua, GIỮ NGUYÊN mốc cũ (lần có lại vẫn so đúng).
 * - Domain mới chỉ xuất hiện ở BE (mốc cũ chưa có) -> chỉ ghi mốc, không invalidate.
 *
 * Gọi ĐÚNG 1 LẦN (trong `useNotificationPoll`).
 */
export function useRefDataChangeSignal(refSig: Record<string, number> | undefined, userId: number | undefined) {
    const queryClient = useQueryClient();
    const baseline = useRef<{ userId: number | undefined; sig: Record<string, number> | undefined }>({
        userId: undefined,
        sig: undefined,
    });

    useEffect(() => {
        if (refSig === undefined) return;

        const prev = baseline.current;
        baseline.current = { userId, sig: { ...(prev.userId === userId ? prev.sig : undefined), ...refSig } };

        if (prev.sig === undefined || prev.userId !== userId) return;

        for (const [domain, version] of Object.entries(refSig)) {
            const before = prev.sig[domain];
            if (before === undefined || before === version) continue;
            for (const queryKey of REF_DATA_QUERY_KEYS[domain] ?? []) {
                queryClient.invalidateQueries({ queryKey: [...queryKey] });
            }
        }
    }, [refSig, userId, queryClient]);
}