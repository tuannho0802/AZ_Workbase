import { describe, it, expect } from 'vitest';
import { isPollSkipped, PollSkippedError } from './poll-skip';

describe('poll-skip', () => {
  it('nhận ra phản hồi skipped của BE', () => {
    expect(isPollSkipped({ skipped: true, reason: 'off-hours' })).toBe(true);
    expect(isPollSkipped({ skipped: true })).toBe(true);
  });
  it('không nhầm với dữ liệu poll thật hoặc giá trị lạ', () => {
    expect(isPollSkipped({ unread: 0, version: 1 })).toBe(false);
    expect(isPollSkipped({ skipped: false })).toBe(false);
    expect(isPollSkipped(null)).toBe(false);
    expect(isPollSkipped('')).toBe(false);
    expect(isPollSkipped(undefined)).toBe(false);
  });
  it('PollSkippedError là Error có tên riêng', () => {
    const e = new PollSkippedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('PollSkippedError');
  });
});
