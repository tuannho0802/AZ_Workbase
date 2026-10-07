import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRefDataChangeSignal, REF_DATA_QUERY_KEYS } from './useRefDataChangeSignal';

let queryClient: QueryClient;
let invalidate: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
const keys = () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
const sig = (over: Record<string, number> = {}) => ({
    departments: 1, positions: 1, roles: 1, customer_statuses: 1, periodic_task_statuses: 1, leave_types: 1, media_sources: 1, ...over,
});

describe('useRefDataChangeSignal (9D)', () => {
    beforeEach(() => {
        queryClient = new QueryClient();
        invalidate = vi.fn().mockResolvedValue(undefined);
        queryClient.invalidateQueries = invalidate as unknown as QueryClient['invalidateQueries'];
    });

    it('lần đầu thấy refSig: chỉ ghi mốc, KHÔNG invalidate', () => {
        renderHook(() => useRefDataChangeSignal(sig(), 7), { wrapper });
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('refSig không đổi giữa các lần poll: không làm gì', () => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), { wrapper, initialProps: { s: sig() } });
        rerender({ s: sig() });
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('chỉ domain có số đổi mới bị invalidate, đúng khoá của domain đó', () => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), { wrapper, initialProps: { s: sig() } });
        rerender({ s: sig({ departments: 2 }) });
        expect(keys()).toEqual([['departments']]);

        invalidate.mockClear();
        rerender({ s: sig({ departments: 2, leave_types: 5, roles: 3 }) });
        expect(keys()).toEqual(expect.arrayContaining([['leave-types'], ['roles']]));
        expect(keys()).toHaveLength(2);
    });

    it.each(Object.entries(REF_DATA_QUERY_KEYS))('domain %s đổi -> invalidate đúng khoá đã khai', (domain, expected) => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), { wrapper, initialProps: { s: sig() } });
        rerender({ s: sig({ [domain]: 9 }) });
        expect(keys()).toEqual(expected.map((k) => [...k]));
    });

    it('cùng 1 số đổi chỉ kích hoạt 1 lần (poll lặp lại cùng giá trị mới không invalidate nữa)', () => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), { wrapper, initialProps: { s: sig() } });
        rerender({ s: sig({ positions: 2 }) });
        rerender({ s: sig({ positions: 2 }) });
        rerender({ s: sig({ positions: 2 }) });
        expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('đổi user đăng nhập: đặt lại mốc, KHÔNG coi là danh mục đổi', () => {
        const { rerender } = renderHook(({ s, u }) => useRefDataChangeSignal(s, u), { wrapper, initialProps: { s: sig(), u: 7 } });
        rerender({ s: sig({ departments: 9 }), u: 8 });
        expect(invalidate).not.toHaveBeenCalled();
        rerender({ s: sig({ departments: 10 }), u: 8 });
        expect(keys()).toEqual([['departments']]);
    });

    it('BE cũ không trả refSig (undefined): bỏ qua', () => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), {
            wrapper,
            initialProps: { s: undefined as Record<string, number> | undefined },
        });
        rerender({ s: undefined });
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('1 lần poll mất refSig rồi có lại với số mới: vẫn so đúng với mốc cũ (không mất thay đổi)', () => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), {
            wrapper,
            initialProps: { s: sig() as Record<string, number> | undefined },
        });
        rerender({ s: undefined });
        expect(invalidate).not.toHaveBeenCalled();
        rerender({ s: sig({ media_sources: 2 }) });
        expect(keys()).toEqual([['media-sources']]);
    });

    it('domain mới chỉ có ở BE (mốc cũ chưa có) hoặc domain lạ: chỉ ghi mốc, không invalidate', () => {
        const { rerender } = renderHook(({ s }) => useRefDataChangeSignal(s, 7), {
            wrapper,
            initialProps: { s: { departments: 1 } as Record<string, number> },
        });
        rerender({ s: { departments: 1, positions: 4, khong_biet: 3 } });
        expect(invalidate).not.toHaveBeenCalled();
        rerender({ s: { departments: 1, positions: 5, khong_biet: 4 } });
        expect(keys()).toEqual([['positions']]); // domain lạ không có khoá -> bỏ qua
    });
});
