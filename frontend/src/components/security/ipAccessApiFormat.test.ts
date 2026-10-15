import { describe, expect, it } from 'vitest';
import { formatApproxHits } from './ipAccessApiFormat';

describe('formatApproxHits (3.6.2)', () => {
  it('có dấu ≈ khi > 0, định dạng hàng nghìn', () => {
    expect(formatApproxHits(5)).toBe('≈ 5');
    expect(formatApproxHits(12345)).toBe('≈ 12,345');
  });
  it('0, null, undefined, NaN, âm -> "0"', () => {
    for (const v of [0, null, undefined, Number.NaN, -3]) expect(formatApproxHits(v as number)).toBe('0');
  });
  it('số lẻ bị cắt phần thập phân', () => {
    expect(formatApproxHits(7.9)).toBe('≈ 7');
  });
});
