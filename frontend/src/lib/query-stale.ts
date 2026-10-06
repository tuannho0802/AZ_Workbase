/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 6A] Thời gian coi dữ liệu THAM CHIẾU (hiếm đổi, chỉ Admin sửa) là còn mới trong 1 phiên SPA.
 * ⚠️ Mọi mutation của dữ liệu dùng hằng số này PHẢI `invalidateQueries` đúng key (xem bảng kiểm trong WORKFLOW_LOG) -
 * nếu thiếu sẽ thành bug "sửa xong không thấy đổi" tối đa 5 phút. Chỉ giúp trong 1 phiên SPA, KHÔNG giúp khi F5 (cache nằm RAM).
 */
export const REFERENCE_DATA_STALE_MS = 5 * 60 * 1000;
