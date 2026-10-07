/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 6A] Thời gian coi dữ liệu THAM CHIẾU (hiếm đổi, chỉ Admin sửa) là còn mới trong 1 phiên SPA.
 * ⚠️ Mọi mutation của dữ liệu dùng hằng số này PHẢI `invalidateQueries` đúng key (xem bảng kiểm trong WORKFLOW_LOG) -
 * nếu thiếu sẽ thành bug "sửa xong không thấy đổi" tối đa 5 phút. Chỉ giúp trong 1 phiên SPA, KHÔNG giúp khi F5 (cache nằm RAM).
 */
export const REFERENCE_DATA_STALE_MS = 5 * 60 * 1000;

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - 9D] Lưới an toàn cho 7 danh mục ít đổi (departments, positions, roles, customer_statuses,
 * periodic_task_statuses, leave_types, media_sources): KHÔNG hỏi lại định kỳ. Làm mới nhờ (1) mutation cục bộ invalidate,
 * (2) `refSig` từ /notifications/poll đổi (xem useRefDataChangeSignal). 2 giờ chỉ là lưới đỡ khi sửa bằng migration/seed/SQL tay.
 * ⚠️ KHÔNG đặt `refetchOnMount: false` (react-query v5: query đã invalidate sẽ không bao giờ refetch khi mở lại trang).
 */
export const REF_DATA_SAFETY_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Tuỳ chọn cache chung cho danh mục ít đổi. `alwaysFresh` (trang quản trị có `inUseCount` đếm từ bảng không bump domain nào,
 * vd customers) -> mỗi lần mở trang tải lại 1 lần.
 */
export function refDataQueryOptions(opts?: { alwaysFresh?: boolean }) {
    return {
        staleTime: opts?.alwaysFresh ? 0 : REF_DATA_SAFETY_STALE_MS,
        gcTime: REF_DATA_SAFETY_STALE_MS,
    };
}
