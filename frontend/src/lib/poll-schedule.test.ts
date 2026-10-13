import { describe, it, expect } from 'vitest';
import { isPollWindowOpen, msUntilPollWindowChange, POLL_INTERVAL_MS } from './poll-schedule';

// Mốc giờ VN (UTC+7) -> UTC. Tuần 12-18/10/2026: T2 12/10, T3 13/10, T4 14/10, T6 16/10, T7 17/10, CN 18/10, T2 19/10.
const vn = (iso: string) => Date.parse(`${iso}+07:00`);
const H = 3_600_000;

describe('poll-schedule', () => {
  it('nhịp poll là 450 giây', () => {
    expect(POLL_INTERVAL_MS).toBe(450_000);
  });

  it('T2-T6: mở trước 18:45, đóng từ đúng 18:45', () => {
    expect(isPollWindowOpen(vn('2026-10-14T10:00:00'))).toBe(true);
    expect(isPollWindowOpen(vn('2026-10-14T00:00:00'))).toBe(true); // không có mốc bắt đầu
    expect(isPollWindowOpen(vn('2026-10-14T07:00:00'))).toBe(true); // mở tab sớm vẫn poll
    expect(isPollWindowOpen(vn('2026-10-16T18:44:59'))).toBe(true);
    expect(isPollWindowOpen(vn('2026-10-16T18:45:00'))).toBe(false);
    expect(isPollWindowOpen(vn('2026-10-14T23:59:59'))).toBe(false);
  });

  it('T7 + CN: không poll cả ngày; T2 00:00 mở lại', () => {
    expect(isPollWindowOpen(vn('2026-10-17T00:00:00'))).toBe(false);
    expect(isPollWindowOpen(vn('2026-10-17T10:00:00'))).toBe(false);
    expect(isPollWindowOpen(vn('2026-10-18T23:59:59'))).toBe(false);
    expect(isPollWindowOpen(vn('2026-10-19T00:00:00'))).toBe(true);
  });

  it('dùng GIỜ VN chứ không phải giờ UTC (T6 23:00 VN vẫn là T6 theo VN, nhưng đã quá 18:45)', () => {
    // 16:30Z T6 = 23:30 VN T6 -> đóng; 17:30Z T6 = 00:30 VN T7 -> đóng; 17:30Z CN = 00:30 VN T2 -> mở.
    expect(isPollWindowOpen(Date.parse('2026-10-16T16:30:00Z'))).toBe(false);
    expect(isPollWindowOpen(Date.parse('2026-10-16T17:30:00Z'))).toBe(false);
    expect(isPollWindowOpen(Date.parse('2026-10-18T17:30:00Z'))).toBe(true);
  });

  it('msUntilPollWindowChange: đang mở -> tới 18:45', () => {
    expect(msUntilPollWindowChange(vn('2026-10-14T10:00:00'))).toBe(8 * H + 45 * 60_000);
    expect(msUntilPollWindowChange(vn('2026-10-14T18:44:00'))).toBe(60_000);
  });

  it('msUntilPollWindowChange: đang đóng -> tới 00:00 ngày làm việc kế tiếp (bỏ qua T7/CN)', () => {
    expect(msUntilPollWindowChange(vn('2026-10-14T18:50:00'))).toBe(5 * H + 10 * 60_000); // T4 -> T5 00:00
    expect(msUntilPollWindowChange(vn('2026-10-16T19:00:00'))).toBe(53 * H); // T6 19:00 -> T2 00:00
    expect(msUntilPollWindowChange(vn('2026-10-17T10:00:00'))).toBe(38 * H); // T7 10:00 -> T2 00:00
    expect(msUntilPollWindowChange(vn('2026-10-18T23:00:00'))).toBe(1 * H); // CN 23:00 -> T2 00:00
  });
});
