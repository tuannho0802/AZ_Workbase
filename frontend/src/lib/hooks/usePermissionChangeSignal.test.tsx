import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePermissionChangeSignal } from './usePermissionChangeSignal';
import { SIDEBAR_BADGES_QUERY_KEY } from './useSidebarBadgeCounts';
import { readRefCacheState, resetRefCacheState, writeRefCacheState } from '../api/ref-cache-version';

let queryClient: QueryClient;
let invalidate: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
const keysInvalidated = () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe('usePermissionChangeSignal', () => {
  beforeEach(() => {
    resetRefCacheState();
    queryClient = new QueryClient();
    invalidate = vi.fn().mockResolvedValue(undefined);
    queryClient.invalidateQueries = invalidate as unknown as QueryClient['invalidateQueries'];
  });

  it('lần đầu thấy permSig: chỉ ghi nhớ mốc, KHÔNG invalidate', () => {
    renderHook(() => usePermissionChangeSignal('1:employee:1:0:0', 7), { wrapper });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('permSig không đổi giữa các lần poll: không làm gì', () => {
    const { rerender } = renderHook(({ s }) => usePermissionChangeSignal(s, 7), {
      wrapper,
      initialProps: { s: '1:employee:1:0:0' },
    });
    rerender({ s: '1:employee:1:0:0' });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('permSig đổi: invalidate quyền, ẩn/hiện UI và badge sidebar', () => {
    const { rerender } = renderHook(({ s }) => usePermissionChangeSignal(s, 7), {
      wrapper,
      initialProps: { s: '1:employee:1:0:0' },
    });
    rerender({ s: '2:employee:1:0:0' });
    const keys = keysInvalidated();
    expect(keys).toContainEqual(['my-permissions']);
    expect(keys).toContainEqual(['ui-visibility-my-hidden']);
    expect(keys).toContainEqual([...SIDEBAR_BADGES_QUERY_KEY]);
  });

  it('ghi permSig vào mốc cục bộ; F5 thấy permSig khác lần trước -> invalidate dữ liệu theo quyền (guides/utms/chấm công)', () => {
    writeRefCacheState({ userId: 7, permSig: '1:employee:1:0:0' });
    renderHook(() => usePermissionChangeSignal('2:employee:1:0:0', 7), { wrapper });
    expect(readRefCacheState().permSig).toBe('2:employee:1:0:0');
    const keys = keysInvalidated();
    expect(keys).toEqual(expect.arrayContaining([['guides'], ['utms'], ['zk-attendance-logs'], ['zk-attendance-summary']]));
    expect(keys).not.toContainEqual(['my-permissions']); // F5 đã tải quyền mới lúc mount
  });

  it('F5 mà permSig không đổi: không invalidate', () => {
    writeRefCacheState({ userId: 7, permSig: '1:employee:1:0:0' });
    renderHook(() => usePermissionChangeSignal('1:employee:1:0:0', 7), { wrapper });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('đổi user đăng nhập: đặt lại mốc, KHÔNG coi là quyền đổi', () => {
    const { rerender } = renderHook(({ s, u }) => usePermissionChangeSignal(s, u), {
      wrapper,
      initialProps: { s: '1:employee:1:0:0', u: 7 },
    });
    rerender({ s: '5:manager:2:0:0', u: 8 });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('BE cũ không trả permSig (undefined): bỏ qua', () => {
    const { rerender } = renderHook(({ s }) => usePermissionChangeSignal(s, 7), {
      wrapper,
      initialProps: { s: undefined as string | undefined },
    });
    rerender({ s: undefined });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('permSig mất rồi quay lại cùng giá trị: không invalidate giả', () => {
    const { rerender } = renderHook(({ s }) => usePermissionChangeSignal(s, 7), {
      wrapper,
      initialProps: { s: '1:employee:1:0:0' as string | undefined },
    });
    rerender({ s: undefined });
    rerender({ s: '1:employee:1:0:0' });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
