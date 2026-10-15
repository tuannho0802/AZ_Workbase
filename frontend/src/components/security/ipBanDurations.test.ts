import { describe, it, expect } from 'vitest';
import { DEFAULT_IP_BAN_DURATION, IP_BAN_DURATIONS, formatBanRemaining } from './ipBanDurations';

describe('ipBanDurations (P3.7)', () => {
  it('5 lựa chọn; chỉ "Vĩnh viễn" có hours = null; mặc định là 24 giờ (ưu tiên có hạn)', () => {
    expect(IP_BAN_DURATIONS.map((d) => d.label)).toEqual(['1 giờ', '24 giờ', '7 ngày', '30 ngày', 'Vĩnh viễn']);
    expect(IP_BAN_DURATIONS.filter((d) => d.hours === null).map((d) => d.value)).toEqual(['perm']);
    expect(IP_BAN_DURATIONS.find((d) => d.value === DEFAULT_IP_BAN_DURATION)?.hours).toBe(24);
    // khớp trần BE: 1..8760 giờ
    for (const d of IP_BAN_DURATIONS) if (d.hours !== null) expect(d.hours).toBeGreaterThanOrEqual(1);
  });

  it('formatBanRemaining: null = Vĩnh viễn; phút / giờ / ngày', () => {
    expect(formatBanRemaining(null)).toBe('Vĩnh viễn');
    expect(formatBanRemaining(30)).toBe('dưới 1 phút');
    expect(formatBanRemaining(150)).toBe('2 phút');
    expect(formatBanRemaining(7300)).toBe('2 giờ 1 phút');
    expect(formatBanRemaining(200000)).toBe('2 ngày 7 giờ');
    expect(formatBanRemaining(-5)).toBe('dưới 1 phút');
  });
});
