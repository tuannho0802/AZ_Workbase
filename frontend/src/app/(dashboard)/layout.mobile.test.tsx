import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VIEWPORTS, resetViewport, setViewport } from '@/test-utils/viewport';

// ── Mock phụ thuộc (layout chỉ được kiểm tra phần điều hướng/Header theo viewport) ──
const h = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/customers',
  can: (_k: string) => true,
  badges: {} as Record<string, number>,
  state: {
    user: { id: 1, name: 'Nguyễn Văn Test', role: 'admin', isRootAdmin: false, avatarUrl: null, avatarKey: null },
    isAuthenticated: true,
    isHydrated: true,
    logout: () => {},
  } as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
  usePathname: () => h.pathname,
}));
vi.mock('@/lib/stores/auth.store', () => ({
  useAuthStore: Object.assign(() => h.state, { getState: () => h.state }),
}));
vi.mock('@/lib/hooks/useMyPermissions', () => ({ useMyPermissions: () => ({ can: (k: string) => h.can(k) }) }));
vi.mock('@/lib/hooks/useSidebarBadgeCounts', () => ({
  useSidebarBadgeCounts: () => h.badges,
  TASK_IN_PROGRESS_COUNT_KEY: 'cong-viec-dinh-ky:in_progress',
}));
vi.mock('@/lib/hooks/useUserActivity', () => ({ getUserActive: () => true, subscribeUserActivity: () => () => {} }));
vi.mock('@/lib/hooks/useCachedImage', () => ({ useCachedImage: () => undefined, buildImageCacheKey: () => 'k' }));
vi.mock('@/lib/hooks/useMe', () => ({
  fetchMeCached: vi.fn().mockResolvedValue({ avatarUrl: null, avatarKey: null, isRootAdmin: false }),
  ME_MAX_AGE_MS: 1,
}));
vi.mock('@/lib/hooks/useRoleColorMap', () => ({ useRoleColorMap: () => ({ getRoleColor: () => 'blue' }) }));
vi.mock('@/components/notifications/NotificationBell', () => ({ NotificationBell: () => <span data-testid="bell" /> }));
vi.mock('@/components/notifications/NotificationDetailModal', () => ({ NotificationDetailModal: () => null }));
vi.mock('@/components/common/CommandPaletteHost', () => ({ CommandPaletteHost: () => null }));
vi.mock('@/components/common/HeaderSearchTrigger', () => ({ HeaderSearchTrigger: () => <span data-testid="search" /> }));
vi.mock('@/components/guides/PageGuideButton', () => ({ PageGuideButton: () => <span data-testid="guide" /> }));
vi.mock('next/image', () => ({ default: () => null }));

import DashboardLayout from './layout';

function renderLayout() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <DashboardLayout>
        <div data-testid="page">nội dung</div>
      </DashboardLayout>
    </QueryClientProvider>,
  );
}

const labelsOf = (root: Element | null) =>
  Array.from(root?.querySelectorAll('.ant-menu-item .ant-menu-title-content') ?? []).map((e) => e.textContent ?? '');
const siderMenu = () => document.querySelector('.ant-layout-sider .ant-menu');
const drawerEl = () => document.querySelector('.az-nav-drawer');
const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));

beforeEach(() => {
  h.push.mockClear();
  h.pathname = '/customers';
  h.can = () => true;
  h.badges = {};
  h.state.isHydrated = true;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  resetViewport();
});

describe('DashboardLayout - mobile (< 992px)', () => {
  it.each([VIEWPORTS.phoneS, VIEWPORTS.phone, VIEWPORTS.tablet])('%ipx: không có Sider cố định, có nút hamburger', (w) => {
    setViewport(w);
    renderLayout();
    expect(document.querySelector('.ant-layout-sider')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mở menu' })).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('bấm hamburger mở Drawer; chọn mục -> router.push đúng path và Drawer đóng', async () => {
    setViewport(VIEWPORTS.phone);
    renderLayout();
    openDrawer();
    const drawer = await waitFor(() => {
      const el = drawerEl();
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(within(drawer).getByText('Khách hàng'));
    expect(h.push).toHaveBeenCalledWith('/customers');
    await waitFor(() => expect(document.querySelector('.az-nav-drawer.ant-drawer-open')).toBeNull());
  });

  it('mục "Trang chủ" trong Drawer -> push("/")', async () => {
    setViewport(VIEWPORTS.phone);
    renderLayout();
    openDrawer();
    const drawer = (await waitFor(() => {
      expect(drawerEl()).not.toBeNull();
      return drawerEl();
    })) as HTMLElement;
    fireEvent.click(within(drawer).getByText('Trang chủ'));
    expect(h.push).toHaveBeenCalledWith('/');
  });

  it('Header mobile gọn: không hiện ngày và tên người dùng', async () => {
    setViewport(VIEWPORTS.phone);
    renderLayout();
    await screen.findByTestId('bell');
    expect(screen.queryByText(/\d{2}\/\d{2}\/\d{4}/)).toBeNull();
    expect(screen.queryByText('Nguyễn Văn Test')).toBeNull();
    // các nút Header vẫn còn để chạm
    expect(screen.getByTestId('search')).toBeInTheDocument();
    expect(screen.getByTestId('guide')).toBeInTheDocument();
  });

  it('highlight đúng mục ở Drawer', async () => {
    h.pathname = '/thong-bao/gui';
    setViewport(VIEWPORTS.phone);
    renderLayout();
    openDrawer();
    const drawer = (await waitFor(() => {
      expect(drawerEl()).not.toBeNull();
      return drawerEl();
    })) as HTMLElement;
    expect(drawer.querySelector('.ant-menu-item-selected')?.textContent).toContain('Gửi thông báo');
  });

  it('không có quyền -> Drawer không hiện mục quản trị', async () => {
    h.can = () => false;
    setViewport(VIEWPORTS.phone);
    renderLayout();
    openDrawer();
    const drawer = (await waitFor(() => {
      expect(drawerEl()).not.toBeNull();
      return drawerEl();
    })) as HTMLElement;
    const labels = labelsOf(drawer);
    expect(labels).toContain('Trang chủ');
    expect(labels).not.toContain('Phân quyền');
    expect(labels).not.toContain('Nhân viên');
  });

  it('đang mở Drawer rồi đổi sang màn hình lớn -> Drawer biến mất, Sider xuất hiện', async () => {
    setViewport(VIEWPORTS.phone);
    renderLayout();
    openDrawer();
    await waitFor(() => expect(drawerEl()).not.toBeNull());
    setViewport(VIEWPORTS.laptop);
    await waitFor(() => expect(document.querySelector('.ant-layout-sider')).not.toBeNull());
    expect(drawerEl()).toBeNull();
  });
});

describe('DashboardLayout - desktop (>= 992px)', () => {
  it('có Sider, không có hamburger, hiện ngày + tên người dùng', async () => {
    setViewport(VIEWPORTS.laptop);
    renderLayout();
    expect(document.querySelector('.ant-layout-sider')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở menu' })).toBeNull();
    expect(screen.getByText('Nguyễn Văn Test')).toBeInTheDocument();
    expect(await screen.findByText(/\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
  });

  it('nút thu gọn vẫn ghi sidebar_collapsed vào localStorage', () => {
    setViewport(VIEWPORTS.laptop);
    renderLayout();
    fireEvent.click(document.querySelector('.anticon-menu-fold')!.closest('button')!);
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
  });

  it.each([
    ['/customers/reports/invalid-data', 'Báo cáo data lỗi'],
    ['/thong-bao/gui', 'Gửi thông báo'],
    ['/thong-bao/da-gui', 'Thông báo đã gửi'],
    ['/nhom-toi-quan-ly', 'Nhóm tôi quản lý'],
    ['/customers', 'Khách hàng'],
  ])('highlight %s -> "%s"', (path, label) => {
    h.pathname = path;
    setViewport(VIEWPORTS.laptop);
    renderLayout();
    expect(siderMenu()?.querySelector('.ant-menu-item-selected')?.textContent).toContain(label);
  });

  it('không có quyền -> không thấy mục quản trị', () => {
    h.can = () => false;
    setViewport(VIEWPORTS.laptop);
    renderLayout();
    const labels = labelsOf(siderMenu());
    expect(labels).not.toContain('Phân quyền');
    expect(labels).not.toContain('Nhân viên');
  });
});

describe('DashboardLayout - Drawer == Sider (cùng nguồn menu + badge)', () => {
  it('danh sách mục và badge giống hệt nhau', async () => {
    h.badges = { 'duyet-phep': 3, 'thong-bao': 7 };
    setViewport(VIEWPORTS.laptop);
    const desktop = renderLayout();
    const siderLabels = labelsOf(siderMenu());
    expect(siderLabels.length).toBeGreaterThan(5);
    desktop.unmount();

    setViewport(VIEWPORTS.phone);
    renderLayout();
    openDrawer();
    const drawer = (await waitFor(() => {
      expect(drawerEl()).not.toBeNull();
      return drawerEl();
    })) as HTMLElement;
    expect(labelsOf(drawer)).toEqual(siderLabels);
    expect(within(drawer).getByText('3')).toBeInTheDocument();
    expect(within(drawer).getByText('7')).toBeInTheDocument();
  });
});

describe('DashboardLayout - chưa hydrate', () => {
  it('hiện màn chờ, không dựng Sider/Drawer', () => {
    h.state.isHydrated = false;
    setViewport(VIEWPORTS.phone);
    renderLayout();
    expect(screen.getByText('Đang đồng bộ dữ liệu...')).toBeInTheDocument();
    expect(document.querySelector('.ant-layout-sider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở menu' })).toBeNull();
  });
});
