import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const pollLite = vi.fn();
const poll = vi.fn();
vi.mock('../api/notifications.api', () => ({ notificationsApi: { pollLite: (...a: unknown[]) => pollLite(...a), poll: (...a: unknown[]) => poll(...a) } }));

import { mergeLitePoll, notificationKeys } from './useNotifications';

describe('mergeLitePoll - làm mới số chưa đọc KHÔNG chạy lại poll gộp', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    pollLite.mockReset();
    poll.mockReset();
  });

  it('gộp unread/version mới vào cache poll, GIỮ NGUYÊN badges, không gọi poll đầy đủ', async () => {
    qc.setQueryData(notificationKeys.poll, { unread: 5, version: 10, epoch: 2, badges: { trash: 3, taskTodo: 4 } });
    pollLite.mockResolvedValue({ unread: 4, version: 10, epoch: 2 });
    await mergeLitePoll(qc);
    expect(qc.getQueryData(notificationKeys.poll)).toEqual({ unread: 4, version: 10, epoch: 2, badges: { trash: 3, taskTodo: 4 } });
    expect(pollLite).toHaveBeenCalledTimes(1);
    expect(poll).not.toHaveBeenCalled();
  });

  it('cache poll chưa có -> không tạo dữ liệu thiếu badges', async () => {
    pollLite.mockResolvedValue({ unread: 1, version: 1 });
    await mergeLitePoll(qc);
    expect(qc.getQueryData(notificationKeys.poll)).toBeUndefined();
  });

  it('lỗi mạng -> không throw, cache cũ giữ nguyên', async () => {
    qc.setQueryData(notificationKeys.poll, { unread: 5, version: 10 });
    pollLite.mockRejectedValue(new Error('network'));
    await expect(mergeLitePoll(qc)).resolves.toBeUndefined();
    expect(qc.getQueryData(notificationKeys.poll)).toEqual({ unread: 5, version: 10 });
  });
});
