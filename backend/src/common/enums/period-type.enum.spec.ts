import { PeriodType, canLinkAsParent } from './period-type.enum';

describe('canLinkAsParent', () => {
  const { DAILY: D, WEEKLY: W, MONTHLY: M, YEARLY: Y } = PeriodType;

  it('cha lớn kỳ hơn con -> hợp lệ (kể cả skip-level)', () => {
    expect(canLinkAsParent(W, D)).toBe(true);
    expect(canLinkAsParent(M, D)).toBe(true);
    expect(canLinkAsParent(Y, W)).toBe(true);
  });

  it('cùng kỳ: chỉ Ngày-Ngày và Tuần-Tuần hợp lệ', () => {
    expect(canLinkAsParent(D, D)).toBe(true);
    expect(canLinkAsParent(W, W)).toBe(true);
    expect(canLinkAsParent(M, M)).toBe(false);
    expect(canLinkAsParent(Y, Y)).toBe(false);
  });

  it('cha nhỏ kỳ hơn con -> luôn bị chặn', () => {
    expect(canLinkAsParent(D, W)).toBe(false);
    expect(canLinkAsParent(W, M)).toBe(false);
    expect(canLinkAsParent(M, Y)).toBe(false);
  });
});
