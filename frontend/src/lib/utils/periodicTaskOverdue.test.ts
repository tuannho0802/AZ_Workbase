import { describe, it, expect } from 'vitest';
import { canMarkOverdue, isManualOverdueActive, canUnmarkOverdue } from './periodicTaskOverdue';

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
  it('canMarkOverdue: hết ân hạn (đã tự động quá hạn) -> false', () => {
    expect(canMarkOverdue(t(), '2026-09-18')).toBe(false);
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
