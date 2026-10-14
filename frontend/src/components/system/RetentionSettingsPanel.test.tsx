import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

const perms = new Set<string>();
let role = 'admin';

vi.mock('@/lib/hooks/useMyPermissions', () => ({
  useMyPermissions: () => ({ can: (k: string) => perms.has(k) }),
}));
vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: (sel: (s: { user: { role: string } }) => unknown) => sel({ user: { role } }),
}));

const getSettings = vi.fn();
vi.mock('@/lib/api/retention.api', () => ({
  retentionApi: {
    getSettings: (...a: unknown[]) => getSettings(...a),
    updateSettings: vi.fn(),
    runNow: vi.fn(),
  },
}));

import { formatDuration, RetentionSettingsPanel } from './RetentionSettingsPanel';

const SETTINGS = {
  intervalDays: 30,
  auditLogs: { enabled: true, retentionDays: 90 },
  taskAuditLogs: { enabled: false, retentionDays: 90 },
  notifications: { enabled: false, retentionDays: 60, unreadRetentionDays: 180 },
  attendanceLogs: { enabled: false, retentionDays: 365 },
  schedule: { lastRun: null, nextDueInSeconds: 0, dueNow: true },
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <RetentionSettingsPanel />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  perms.clear();
  role = 'admin';
  getSettings.mockReset();
  getSettings.mockResolvedValue(SETTINGS);
});

describe('formatDuration', () => {
  it.each([
    [29 * 86400, '29 ngày'],
    [86400 + 3 * 3600, '1 ngày 3 giờ'],
    [5 * 3600, '5 giờ'],
    [30, '1 phút'],
  ])('%i giây -> %s', (s, text) => expect(formatDuration(s)).toBe(text));
});

describe('RetentionSettingsPanel', () => {
  it('không có audit.view -> không render và không gọi API', () => {
    const { container } = renderPanel();
    expect(container.textContent).toBe('');
    expect(getSettings).not.toHaveBeenCalled();
  });

  it('có audit.manage + admin: hiện cấu hình, "chưa chạy lần nào" và đủ nút', async () => {
    perms.add('audit.view');
    perms.add('audit.manage');
    renderPanel();
    expect(await screen.findByText(/chưa chạy lần nào/)).toBeTruthy();
    expect(screen.getByText('Log chấm công')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lưu cấu hình/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Chạy thử/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Chạy ngay/ })).toBeTruthy();
  });

  it('chỉ audit.view: chỉ xem, không có nút Lưu/Chạy', async () => {
    perms.add('audit.view');
    renderPanel();
    await screen.findByText(/chưa chạy lần nào/);
    expect(screen.queryByRole('button', { name: /Lưu cấu hình/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Chạy ngay/ })).toBeNull();
  });

  it('manager (không phải admin): công tắc chấm công bị khoá, không có nút Chạy ngay', async () => {
    perms.add('audit.view');
    perms.add('audit.manage');
    role = 'manager';
    renderPanel();
    await screen.findByText(/chưa chạy lần nào/);
    const switches = screen.getAllByRole('switch');
    // thứ tự hàng: audit, task audit, notifications, attendance
    expect((switches[3] as HTMLButtonElement).disabled).toBe(true);
    expect((switches[0] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /Chạy ngay/ })).toBeNull();
  });

  it('hiện thời gian lần chạy gần nhất và lần chạy tiếp theo còn bao lâu', async () => {
    perms.add('audit.view');
    getSettings.mockResolvedValue({
      ...SETTINGS,
      schedule: {
        lastRun: { status: 'success', affected: 1234, message: null, ageSeconds: 86400 },
        nextDueInSeconds: 29 * 86400,
        dueNow: false,
      },
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/1 ngày trước/)).toBeTruthy());
    expect(screen.getByText(/xoá 1234 dòng/)).toBeTruthy();
    expect(screen.getByText(/còn 29 ngày/)).toBeTruthy();
  });
});
