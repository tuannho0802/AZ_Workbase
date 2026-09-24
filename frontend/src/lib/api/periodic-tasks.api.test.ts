import { describe, it, expect } from 'vitest';
import { canLinkAsParent } from './periodic-tasks.api';

describe('canLinkAsParent (mirror BE)', () => {
  it('cha lớn kỳ hơn con -> hợp lệ (kể cả skip-level)', () => {
    expect(canLinkAsParent('weekly', 'daily')).toBe(true);
    expect(canLinkAsParent('monthly', 'daily')).toBe(true);
    expect(canLinkAsParent('yearly', 'weekly')).toBe(true);
  });

  it('cùng kỳ: chỉ Ngày-Ngày và Tuần-Tuần hợp lệ', () => {
    expect(canLinkAsParent('daily', 'daily')).toBe(true);
    expect(canLinkAsParent('weekly', 'weekly')).toBe(true);
    expect(canLinkAsParent('monthly', 'monthly')).toBe(false);
    expect(canLinkAsParent('yearly', 'yearly')).toBe(false);
  });

  it('cha nhỏ kỳ hơn con -> luôn bị chặn', () => {
    expect(canLinkAsParent('daily', 'weekly')).toBe(false);
    expect(canLinkAsParent('weekly', 'monthly')).toBe(false);
  });
});
