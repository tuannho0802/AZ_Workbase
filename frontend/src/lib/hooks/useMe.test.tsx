import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const getMe = vi.fn();
vi.mock('../api/users.api', () => ({ usersApi: { getMe: (...a: unknown[]) => getMe(...a) } }));

import { fetchMeCached, refreshMe, ME_KEY } from './useMe';

const ME = { id: 1, name: 'A' };

describe('fetchMeCached (Plan CPU Mục 4 - 1 nguồn /users/me)', () => {
  let qc: QueryClient;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    getMe.mockReset();
    getMe.mockResolvedValue(ME);
    qc = new QueryClient();
  });
  afterEach(() => vi.useRealTimers());

  it('layout + trang khác gọi liên tiếp trong hạn -> chỉ 1 request', async () => {
    await fetchMeCached(qc, 7 * 60_000); // layout lúc mount
    await fetchMeCached(qc, 60_000); // profile mở sau vài giây
    await fetchMeCached(qc, 7 * 60_000);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('2 lời gọi ĐỒNG THỜI cũng chỉ 1 request (dedupe)', async () => {
    await Promise.all([fetchMeCached(qc, 60_000), fetchMeCached(qc, 7 * 60_000)]);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('quá hạn (activity-resume > 7 phút) -> gọi lại đúng 1 lần', async () => {
    await fetchMeCached(qc, 7 * 60_000);
    vi.advanceTimersByTime(8 * 60_000);
    await fetchMeCached(qc, 7 * 60_000);
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('refreshMe (sau khi user sửa hồ sơ) luôn gọi API và ghi cache cho nơi khác', async () => {
    await fetchMeCached(qc, 7 * 60_000);
    getMe.mockResolvedValueOnce({ id: 1, name: 'B' });
    await refreshMe(qc);
    expect(getMe).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData(ME_KEY)).toEqual({ id: 1, name: 'B' });
    await fetchMeCached(qc, 7 * 60_000); // nơi khác dùng luôn bản mới
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('invalidate(["users"]) (đổi avatar) -> lần fetch kế tiếp gọi lại dù còn trong hạn', async () => {
    await fetchMeCached(qc, 7 * 60_000);
    await qc.invalidateQueries({ queryKey: ['users'], refetchType: 'none' });
    await fetchMeCached(qc, 7 * 60_000);
    expect(getMe).toHaveBeenCalledTimes(2);
  });
});
