import type { PerformanceUserRow } from '../api/periodic-task-performance.api';
import type { PeriodicTask } from '../api/periodic-tasks.api';

export interface PerformanceTotals {
  total: number;
  completedOnTime: number;
  completedLate: number;
  overdueNotCompleted: number;
  pendingFuture: number;
  inProgressCount: number;
  inReviewCount: number;
  checklistDone: number;
  checklistTotal: number;
  completionRatePercent: number | null;
  lateRatePercent: number | null;
  inProgressRatePercent: number | null;
  inReviewRatePercent: number | null;
  checklistRatePercent: number | null;
}

/** Làm tròn 1 số lẻ, `null` nếu mẫu số = 0 (cùng quy ước với BE). */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Cộng dồn các dòng User thành 1 dòng "Tổng" - tính lại % từ SỐ ĐẾM, không
 * lấy trung bình các % (tránh lệch khi số Task mỗi người khác nhau). */
export function aggregateRows(rows: PerformanceUserRow[]): PerformanceTotals {
  const sum = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      completedOnTime: acc.completedOnTime + r.completedOnTime,
      completedLate: acc.completedLate + r.completedLate,
      overdueNotCompleted: acc.overdueNotCompleted + r.overdueNotCompleted,
      pendingFuture: acc.pendingFuture + r.pendingFuture,
      inProgressCount: acc.inProgressCount + r.inProgressCount,
      inReviewCount: acc.inReviewCount + r.inReviewCount,
      checklistDone: acc.checklistDone + r.checklistDone,
      checklistTotal: acc.checklistTotal + r.checklistTotal,
    }),
    {
      total: 0,
      completedOnTime: 0,
      completedLate: 0,
      overdueNotCompleted: 0,
      pendingFuture: 0,
      inProgressCount: 0,
      inReviewCount: 0,
      checklistDone: 0,
      checklistTotal: 0,
    },
  );
  const completed = sum.completedOnTime + sum.completedLate;
  return {
    ...sum,
    completionRatePercent: percentOf(completed, sum.total),
    lateRatePercent: percentOf(sum.completedLate, completed),
    inProgressRatePercent: percentOf(sum.inProgressCount, sum.total),
    inReviewRatePercent: percentOf(sum.inReviewCount, sum.total),
    checklistRatePercent: percentOf(sum.checklistDone, sum.checklistTotal),
  };
}

/** Màu Progress % hoàn thành: càng cao càng xanh. */
export function completionColor(percent: number | null): string {
  if (percent == null) return '#d9d9d9';
  if (percent >= 80) return '#52c41a';
  if (percent >= 50) return '#faad14';
  return '#f5222d';
}

/** Màu Tag % xong muộn: càng cao càng đỏ (ngược với % hoàn thành). */
export function lateRateColor(percent: number | null): 'default' | 'success' | 'warning' | 'error' {
  if (percent == null) return 'default';
  if (percent === 0) return 'success';
  if (percent <= 20) return 'warning';
  return 'error';
}

export type FlaggedKind = 'late' | 'overdue';

/**
 * Drill-down BE chỉ trả danh sách Task (không kèm nhãn late/overdue) nên FE
 * suy ra từ trạng thái HIỆN TẠI: đã ở trạng thái xong/In review => "xong
 * muộn", ngược lại => "quá hạn chưa xong". Có thể lệch với BE ở trường hợp
 * hiếm: Task từng chạm In review đúng hạn rồi bị mở lại (BE tính theo lần
 * ĐẦU chạm mốc, FE chỉ thấy trạng thái hiện tại).
 */
export function classifyFlaggedTask(task: Pick<PeriodicTask, 'status'>): FlaggedKind {
  const s = task.status;
  return s?.isDoneState || s?.code === 'in_review' ? 'late' : 'overdue';
}

/**
 * hasStartedWorking - dùng để chia Drawer "Công việc cần lưu ý" thành 2 nhóm
 * (yêu cầu chủ dự án 2026-09-25): "Đang làm trở lên" (đã bắt đầu động vào -
 * `in_progress`/`in_review`/đã xong) vs phần còn lại (status TRƯỚC
 * `in_progress`, vd `pending`/`todo` - coi như CHƯA động vào).
 *
 * ⚠️ GIẢ ĐỊNH CẦN XÁC NHẬN LẠI: dựa trên `status.code` hiện tại, KHÔNG dựa
 * trên `sortOrder` (bảng `periodic_task_statuses` là danh sách ĐỘNG do Admin
 * tự CRUD) - nếu dự án có thêm status trung gian khác NGOÀI `in_progress`/
 * `in_review`/`is_done_state` (vd 1 status "Chờ duyệt" riêng), status đó sẽ
 * bị xếp nhầm vào nhóm "chưa động vào" dù thực tế đã có người xử lý.
 */
export function hasStartedWorking(task: Pick<PeriodicTask, 'status'>): boolean {
  const s = task.status;
  return !!s && (s.code === 'in_progress' || s.code === 'in_review' || s.isDoneState);
}