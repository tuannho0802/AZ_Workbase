import { rawDateToYmd } from './raw-date.helper';

describe('rawDateToYmd', () => {
  it('giữ nguyên chuỗi YYYY-MM-DD', () => {
    expect(rawDateToYmd('2026-09-29')).toBe('2026-09-29');
  });

  it('cắt phần giờ nếu là chuỗi ISO', () => {
    expect(rawDateToYmd('2026-09-29T00:00:00.000Z')).toBe('2026-09-29');
  });

  it('Date (mysql2 trả cho cột DATE, nửa đêm local) -> đúng ngày, KHÔNG lệch', () => {
    expect(rawDateToYmd(new Date(2026, 8, 29))).toBe('2026-09-29');
  });

  it('Date đầu tháng/đầu năm không bị lệch ngày', () => {
    expect(rawDateToYmd(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(rawDateToYmd(new Date(2026, 8, 1))).toBe('2026-09-01');
  });
});
