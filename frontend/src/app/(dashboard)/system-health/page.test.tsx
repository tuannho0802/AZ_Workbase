import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import SystemHealthPage from './page';
import { systemApi, type SystemHealth } from '@/lib/api/system.api';

const replace = vi.fn();
const storeState: { user: Record<string, unknown> | null } = { user: null };

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: (sel?: (s: typeof storeState) => unknown) => (sel ? sel(storeState) : storeState),
}));
vi.mock('@/lib/api/system.api', () => ({ systemApi: { getHealth: vi.fn() } }));

const health = (over: Partial<SystemHealth> = {}): SystemHealth => ({
  generatedAt: '2026-10-16T03:00:00.000Z',
  app: { error: false, version: '0.0.1', commit: 'abc1234', region: 'sin1', nodeEnv: 'production', nodeVersion: 'v22.0.0', uptimeSeconds: 7200 },
  database: { error: false, ok: true, pingMs: 12, serverVersion: '8.0.36' },
  tables: {
    error: false,
    items: [
      { name: 'audit_logs', rowsEstimate: 900_000, sizeBytes: 300 * 1024 * 1024, watched: true, warn: true },
      { name: 'customers', rowsEstimate: 1200, sizeBytes: 2048, watched: false, warn: false },
    ],
    totalBytes: 300 * 1024 * 1024 + 2048,
    warnCount: 1,
    cachedAt: '2026-10-16T02:58:00.000Z',
    fromCache: true,
  },
  cron: { error: false, job: 'retention', intervalDays: 14, lastRun: { status: 'success', affected: 42, message: null, ageSeconds: 86400 }, nextDueInSeconds: 3600, dueNow: false, warn: false, warnReason: null },
  caches: { error: false, scope: 'current_instance', items: [{ key: 'auth_user', label: 'Người dùng đăng nhập (JwtStrategy)', ttlSeconds: 10, entries: 4 }] },
  sessions: { error: false, totalSessions: 7, usersWithSessions: 5 },
  security: { error: false, activeIpLocks: 2, activeIpBans: 1 },
  ...over,
});

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App>
        <SystemHealthPage />
      </App>
    </QueryClientProvider>,
  );
};

describe('SystemHealthPage (P8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.user = { id: 1, role: 'admin', isRootAdmin: true };
  });

  it('Admin thường (không root): chuyển về trang chủ, KHÔNG gọi API', async () => {
    storeState.user = { id: 2, role: 'admin', isRootAdmin: false };
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(systemApi.getHealth).not.toHaveBeenCalled();
  });

  it('role khác admin: chuyển về trang chủ, KHÔNG gọi API', async () => {
    storeState.user = { id: 3, role: 'manager', isRootAdmin: true };
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(systemApi.getHealth).not.toHaveBeenCalled();
  });

  it('Root Admin: hiện các phần số liệu', async () => {
    vi.mocked(systemApi.getHealth).mockResolvedValue(health());
    renderPage();
    expect(await screen.findByText('audit_logs')).toBeInTheDocument();
    expect(screen.getByText('Cần dọn')).toBeInTheDocument();
    expect(screen.getByText('Người dùng đăng nhập (JwtStrategy)')).toBeInTheDocument();
    expect(screen.getByText('14 ngày')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('cron cảnh báo: hiện đúng thông điệp theo lý do', async () => {
    const base = health();
    if (base.cron.error) throw new Error();
    vi.mocked(systemApi.getHealth).mockResolvedValue(health({ cron: { ...base.cron, warn: true, warnReason: 'OVERDUE' } }));
    renderPage();
    expect(await screen.findByText(/Quá hạn/)).toBeInTheDocument();
  });

  it('1 phần lỗi chỉ hiện cảnh báo ở phần đó, các phần khác vẫn hiển thị', async () => {
    vi.mocked(systemApi.getHealth).mockResolvedValue(health({ tables: { error: true } }));
    renderPage();
    expect(await screen.findByText('Không đọc được phần này')).toBeInTheDocument();
    expect(screen.getByText('Người dùng đăng nhập (JwtStrategy)')).toBeInTheDocument();
    expect(screen.queryByText('audit_logs')).not.toBeInTheDocument();
  });

  it('nút Làm mới gọi lại API với fresh=true; lần tải đầu fresh=false', async () => {
    vi.mocked(systemApi.getHealth).mockResolvedValue(health());
    renderPage();
    await screen.findByText('audit_logs');
    expect(vi.mocked(systemApi.getHealth).mock.calls[0][0]).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    await waitFor(() => expect(vi.mocked(systemApi.getHealth).mock.calls.some((c) => c[0] === true)).toBe(true));
  });
});
