import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyPermissions } from './useMyPermissions';
import { rolesApi } from '../api/roles.api';
import { useAuthStore } from '../stores/auth.store';
import type { PermissionScope } from '../types/roles.types';

vi.mock('../api/roles.api', () => ({
  rolesApi: { getMyPermissions: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMyPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set thẳng state auth store thay vì login() thật - store là singleton
    // toàn cục (zustand), test sau không ảnh hưởng test trước nhờ reset ở đây.
    useAuthStore.setState({ isAuthenticated: true, user: { id: 1, role: 'admin' } as any });
  });

  it('can() trả true cho permission role hiện tại thực sự có', async () => {
    (rolesApi.getMyPermissions as any).mockResolvedValue({
      'customers.view': 'all' satisfies PermissionScope,
      'roles.manage': null,
    });

    const { result } = renderHook(() => useMyPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.can('customers.view')).toBe(true);
    expect(result.current.can('roles.manage')).toBe(true);
  });

  it('can() trả false cho permission role KHÔNG có (không có dòng trong map)', async () => {
    (rolesApi.getMyPermissions as any).mockResolvedValue({
      'customers.view': 'all' satisfies PermissionScope,
    });

    const { result } = renderHook(() => useMyPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.can('customers.delete')).toBe(false);
  });

  it('can() trả false khi CHƯA có dữ liệu (đang loading) - KHÔNG mặc định true', () => {
    (rolesApi.getMyPermissions as any).mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useMyPermissions(), { wrapper });

    // Đây chính là điểm mấu chốt chống lộ UI: trong lúc đang tải permission
    // (vd F5 trang), mọi permission PHẢI coi là "chưa có" - không được lộ
    // nút ra rồi ẩn lại sau khi tải xong.
    expect(result.current.can('customers.view')).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('scope() trả đúng giá trị scope, null cho permission nhị phân hoặc không có', async () => {
    (rolesApi.getMyPermissions as any).mockResolvedValue({
      'customers.view': 'department' satisfies PermissionScope,
      'roles.manage': null,
    });

    const { result } = renderHook(() => useMyPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.scope('customers.view')).toBe('department' satisfies PermissionScope);
    expect(result.current.scope('roles.manage')).toBeNull();
    expect(result.current.scope('khong_ton_tai')).toBeNull();
  });

  it('user CHƯA đăng nhập -> không gọi API, can() luôn false', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });

    const { result } = renderHook(() => useMyPermissions(), { wrapper });

    expect(rolesApi.getMyPermissions).not.toHaveBeenCalled();
    expect(result.current.can('customers.view')).toBe(false);
  });

  it('API lỗi (vd 401/500) -> can() trả false thay vì throw hoặc crash UI', async () => {
    (rolesApi.getMyPermissions as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMyPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(() => result.current.can('customers.view')).not.toThrow();
    expect(result.current.can('customers.view')).toBe(false);
  });
});
