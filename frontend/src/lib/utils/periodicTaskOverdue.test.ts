import { describe, it, expect } from 'vitest';
import { canMarkOverdue, isManualOverdueActive, canUnmarkOverdue, isTaskOverdue, getOverdueDays, isOverdueFlagged } from './periodicTaskOverdue';

const t = (over: Record<string, unknown> = {}) =>
  ({ periodEndDate: '2026-09-10', status: { code: 'in_progress' }, overdueMarkedAt: null, ...over }) as never;

describe('periodicTaskOverdue', () => {
  it('canMarkOverdue: chưa qua deadline (đúng ngày cuối kỳ) -> false', () => {
    expect(canMarkOverdue(t(), '2026-09-10')).toBe(false);
  });
  it('canMarkOverdue: đã qua deadline, trong ân hạn 7 ngày -> true', () => {
    expect(canMarkOverdue(t(), '2026-09-11')).toBe(true);
    expect(canMarkOverdue(t(), '2026-09-17')).toBe(true);
  });
  it('canMarkOverdue: quá hạn lâu (hết ân hạn 7 ngày) VẪN hiện nút nếu chưa có dấu (bug 2026-10-06: kỳ 01-06/09 xem 06/10 mất nút)', () => {
    expect(canMarkOverdue(t(), '2026-09-18')).toBe(true);
    expect(canMarkOverdue(t({ periodEndDate: '2026-09-06' }), '2026-10-06')).toBe(true);
  });
  it('canMarkOverdue: đã xong (in_review/done) hoặc đã đánh dấu -> false', () => {
    expect(canMarkOverdue(t({ status: { code: 'done' } }), '2026-09-12')).toBe(false);
    expect(canMarkOverdue(t({ status: { code: 'in_review' } }), '2026-09-12')).toBe(false);
    expect(canMarkOverdue(t({ overdueMarkedAt: '2026-09-12T00:00:00Z' }), '2026-09-12')).toBe(false);
  });
  it('isManualOverdueActive: có dấu + quá hạn kỳ + chưa xong -> true; kéo dài kỳ -> false; đã xong -> false', () => {
    const marked = { overdueMarkedAt: '2026-09-12T00:00:00Z' };
    expect(isManualOverdueActive(t(marked), '2026-09-12')).toBe(true);
    expect(isManualOverdueActive(t({ ...marked, periodEndDate: '2026-09-30' }), '2026-09-12')).toBe(false);
    expect(isManualOverdueActive(t({ ...marked, status: { code: 'done' } }), '2026-09-12')).toBe(false);
  });
  it('canUnmarkOverdue: chỉ khi có dấu', () => {
    expect(canUnmarkOverdue(t())).toBe(false);
    expect(canUnmarkOverdue(t({ overdueMarkedAt: '2026-09-12T00:00:00Z' }))).toBe(true);
  });
});

describe('isTaskOverdue / getOverdueDays', () => {
  it('đúng ngày cuối kỳ -> chưa quá hạn', () => {
    expect(isTaskOverdue(t(), '2026-09-10')).toBe(false);
    expect(getOverdueDays(t(), '2026-09-10')).toBe(0);
  });
  it('quá deadline 1-2 ngày -> CHƯA quá hạn (quá hạn sau 3 ngày)', () => {
    expect(isTaskOverdue(t(), '2026-09-11')).toBe(false);
    expect(isTaskOverdue(t(), '2026-09-12')).toBe(false);
  });
  it('đủ 3 ngày sau deadline, chưa xong -> quá hạn (không cần đánh dấu tay)', () => {
    expect(isTaskOverdue(t(), '2026-09-13')).toBe(true);
    expect(getOverdueDays(t(), '2026-09-13')).toBe(3);
  });
  it('qua ngày ân hạn 7 ngày vẫn là quá hạn', () => {
    expect(isTaskOverdue(t(), '2026-09-28')).toBe(true);
    expect(getOverdueDays(t(), '2026-09-28')).toBe(18);
  });
  it('đã in_review / done / completed / is_done_state -> không quá hạn dù trễ deadline', () => {
    expect(isTaskOverdue(t({ status: { code: 'in_review' } }), '2026-09-28')).toBe(false);
    expect(isTaskOverdue(t({ status: { code: 'done' } }), '2026-09-28')).toBe(false);
    expect(isTaskOverdue(t({ status: { code: 'completed' } }), '2026-09-28')).toBe(false);
    expect(isTaskOverdue(t({ status: { code: 'custom_done', isDoneState: true } }), '2026-09-28')).toBe(false);
  });
});

describe('isOverdueFlagged (cờ Quá hạn ở mọi view)', () => {
  it('chưa đủ 3 ngày và chưa có dấu -> không cờ', () => {
    expect(isOverdueFlagged(t(), '2026-09-12')).toBe(false);
  });
  it('đủ 3 ngày chưa xong -> cờ', () => {
    expect(isOverdueFlagged(t(), '2026-09-13')).toBe(true);
  });
  it('có dấu quá hạn + đã qua hạn kỳ (dù < 3 ngày) -> cờ', () => {
    expect(isOverdueFlagged(t({ overdueMarkedAt: '2026-09-11T00:00:00Z' }), '2026-09-11')).toBe(true);
  });
  it('đã xong (completed) -> không cờ dù có dấu cũ', () => {
    expect(isOverdueFlagged(t({ status: { code: 'completed' }, overdueMarkedAt: '2026-09-11T00:00:00Z' }), '2026-09-30')).toBe(false);
  });
});
