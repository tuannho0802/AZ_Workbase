import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const replace = vi.fn();
const warning = vi.fn();
const perm: { can: (key: string) => boolean; isLoading: boolean } = { can: () => false, isLoading: false };
const managedSpy = vi.fn();
const allSpy = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('antd', async (orig) => {
    const actual = await orig<typeof import('antd')>();
    return { ...actual, App: { ...actual.App, useApp: () => ({ message: { warning, error: vi.fn(), success: vi.fn() }, modal: {} }) } };
});
vi.mock('@/lib/hooks/useMyPermissions', () => ({ useMyPermissions: () => perm }));
vi.mock('@/lib/stores/auth.store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1 } }) }));
vi.mock('@/lib/hooks/useLinkGroups', async (orig) => ({
    ...(await orig<typeof import('@/lib/hooks/useLinkGroups')>()),
    useManagedByMe: (enabled?: boolean) => (managedSpy(enabled), { groups: [], isLoading: false }),
    useAllLinkGroups: (enabled?: boolean) => (allSpy(enabled), { groups: [], isLoading: false }),
    useGroupCustomerCounts: () => ({ counts: {}, isLoading: false }),
}));

import MyManagedLinkGroupsPage from './page';

const renderPage = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
    replace.mockClear();
    warning.mockClear();
    managedSpy.mockClear();
    allSpy.mockClear();
});

describe('Nhóm tôi quản lý - tắt quyền link_groups.my_managed', () => {
    it('không gọi API, không toast, chuyển về Trang chủ im lặng, không render nội dung', () => {
        perm.can = () => false;
        const { container } = renderPage(<MyManagedLinkGroupsPage />);
        expect(managedSpy).toHaveBeenLastCalledWith(false);
        expect(allSpy).toHaveBeenLastCalledWith(false);
        expect(replace).toHaveBeenCalledWith('/');
        expect(warning).not.toHaveBeenCalled();
        expect(container.textContent).toBe('');
    });
    it('có quyền -> gọi API, không redirect', () => {
        perm.can = (k) => k === 'link_groups.my_managed';
        renderPage(<MyManagedLinkGroupsPage />);
        expect(managedSpy).toHaveBeenLastCalledWith(true);
        expect(replace).not.toHaveBeenCalled();
    });
});
