import { COMPLETED_STATUS_CODES, isPastPeriodEnd } from './overdue.helper';

/** Thứ tự tiến độ của các status hệ thống (status tuỳ chỉnh không có trong map -> không tự ép). */
const STATUS_RANK: Record<string, number> = { not_started: 0, in_progress: 1, in_review: 2, done: 3 };

/** Chỉ cho phép FE xin ép sang 2 status này qua checklist. */
export const CHECKLIST_NEXT_STATUS_CODES = ['in_progress', 'in_review'] as const;
export type ChecklistNextStatusCode = (typeof CHECKLIST_NEXT_STATUS_CODES)[number];

/**
 * Status đích khi TICK 1 checklist item (Guard "To-do không được có checklist đã tick"):
 *  - Task đang not_started -> LUÔN ép tối thiểu in_progress, dù FE không gửi gì.
 *  - FE xin `requested` (in_progress/in_review) -> chỉ áp nếu TIẾN LÊN (không hạ in_review/done xuống).
 * Trả null = không đổi status.
 */
export function resolveTickTargetStatus(
  currentCode: string | null | undefined,
  requested: ChecklistNextStatusCode | undefined,
): ChecklistNextStatusCode | null {
  const cur = currentCode != null ? STATUS_RANK[currentCode] : undefined;
  if (cur === undefined) return null;
  const target: ChecklistNextStatusCode | null = requested ?? (currentCode === 'not_started' ? 'in_progress' : null);
  if (!target) return null;
  return STATUS_RANK[target] > cur ? target : null;
}

/** Task đang ở trạng thái "đã hoàn thành" (in_review/done hoặc status đánh dấu is_done_state). */
export function isCompletedTask(status: { code?: string | null; isDoneState?: boolean } | null | undefined): boolean {
  if (!status) return false;
  return status.isDoneState === true || (COMPLETED_STATUS_CODES as readonly string[]).includes(status.code ?? '');
}

/** Mở lại Task đã xong: kỳ đã qua (hôm nay > period_end) -> kéo period_end tới hôm nay; ngược lại giữ nguyên (null). */
export function extendedPeriodEndForReopen(periodEndDate: string, today: string): string | null {
  return isPastPeriodEnd(periodEndDate, today) ? today : null;
}
