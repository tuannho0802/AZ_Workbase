import { COMPLETED_STATUS_CODES, OVERDUE_AFTER_DAYS, isOverdueByDeadline, isOverdueNotCompleted, isPastPeriodEnd } from './overdue.helper';

describe('overdue.helper', () => {
  // period_end = 2026-09-10, ân hạn 7 ngày -> tự động quá hạn từ 2026-09-18
  const end = '2026-09-10';

  it('isOverdueByDeadline: quá hạn sau 3 ngày (end 10/09 -> chưa quá hạn 11-12/09, quá hạn từ 13/09)', () => {
    expect(OVERDUE_AFTER_DAYS).toBe(3);
    expect(isOverdueByDeadline(end, '2026-09-10')).toBe(false);
    expect(isOverdueByDeadline(end, '2026-09-11')).toBe(false);
    expect(isOverdueByDeadline(end, '2026-09-12')).toBe(false);
    expect(isOverdueByDeadline(end, '2026-09-13')).toBe(true);
  });

  it('COMPLETED_STATUS_CODES có `completed` (status Hoàn thành không bị coi là quá hạn)', () => {
    expect(COMPLETED_STATUS_CODES).toEqual(expect.arrayContaining(['in_review', 'done', 'completed']));
  });

  it('isPastPeriodEnd: chỉ true khi hôm nay SAU period_end (đúng ngày cuối chưa quá hạn)', () => {
    expect(isPastPeriodEnd(end, '2026-09-10')).toBe(false);
    expect(isPastPeriodEnd(end, '2026-09-11')).toBe(true);
  });

  it('trong ân hạn + không đánh dấu -> chưa quá hạn', () => {
    expect(isOverdueNotCompleted(end, null, '2026-09-15', 7)).toBe(false);
  });

  it('trong ân hạn + có đánh dấu thủ công -> quá hạn', () => {
    expect(isOverdueNotCompleted(end, new Date(), '2026-09-15', 7)).toBe(true);
  });

  it('hết ân hạn -> quá hạn tự động kể cả không đánh dấu', () => {
    expect(isOverdueNotCompleted(end, null, '2026-09-18', 7)).toBe(true);
  });

  it('có dấu cũ nhưng Task được kéo dài kỳ (chưa qua hạn mới) -> không quá hạn', () => {
    expect(isOverdueNotCompleted('2026-09-30', new Date(), '2026-09-15', 7)).toBe(false);
  });
});
