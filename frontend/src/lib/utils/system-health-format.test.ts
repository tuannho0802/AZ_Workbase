import { describe, expect, it } from 'vitest';
import { CRON_WARN_LABEL, formatDurationVi, formatRowsEstimate } from './system-health-format';

describe('formatDurationVi', () => {
  it('chỉ lấy 2 đơn vị lớn nhất', () => {
    expect(formatDurationVi(86400 + 2 * 3600 + 5 * 60)).toBe('1 ngày 2 giờ');
    expect(formatDurationVi(3 * 3600 + 20 * 60)).toBe('3 giờ 20 phút');
    expect(formatDurationVi(5 * 60)).toBe('5 phút');
  });
  it('dưới 1 phút / số âm', () => {
    expect(formatDurationVi(30)).toBe('dưới 1 phút');
    expect(formatDurationVi(-5)).toBe('dưới 1 phút');
  });
});

describe('formatRowsEstimate', () => {
  it('chia nghìn/triệu', () => {
    expect(formatRowsEstimate(800)).toBe('~800');
    expect(formatRowsEstimate(350_000)).toBe('~350 nghìn');
    expect(formatRowsEstimate(1_200_000)).toContain('triệu');
  });
});

describe('CRON_WARN_LABEL', () => {
  it('đủ nhãn cho cả 3 lý do cảnh báo của BE', () => {
    expect(Object.keys(CRON_WARN_LABEL).sort()).toEqual(['LAST_RUN_INCOMPLETE', 'NEVER_RAN', 'OVERDUE']);
  });
});
