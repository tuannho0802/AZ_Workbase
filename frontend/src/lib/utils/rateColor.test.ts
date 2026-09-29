import { describe, expect, it } from 'vitest';
import { rateColor, rateLevel, rateTextColor, RATE_COLORS } from './rateColor';

describe('rateColor', () => {
  it('< 40 đỏ, 40..80 vàng, > 80 xanh', () => {
    expect(rateLevel(0)).toBe('low');
    expect(rateLevel(39.9)).toBe('low');
    expect(rateLevel(40)).toBe('mid');
    expect(rateLevel(80)).toBe('mid');
    expect(rateLevel(80.1)).toBe('high');
    expect(rateLevel(100)).toBe('high');
  });
  it('null/NaN -> không tô màu', () => {
    expect(rateColor(null)).toBeUndefined();
    expect(rateTextColor(undefined)).toBeUndefined();
    expect(rateColor(NaN)).toBeUndefined();
  });
  it('trả đúng màu', () => {
    expect(rateColor(10)).toBe(RATE_COLORS.low);
    expect(rateColor(90)).toBe(RATE_COLORS.high);
    expect(rateTextColor(50)).not.toBe(RATE_COLORS.mid);
  });
});
