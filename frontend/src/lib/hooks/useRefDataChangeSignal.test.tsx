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
EOF
cat > refDataCallCount.test.tsx << 'EOF'
/**
 * SPEC 9D (PLAN_CPU_OPTIMIZATION_ROUND2): danh mục ít đổi KHÔNG hỏi lại định kỳ - chỉ tải lại khi mutation cục bộ hoặc refSig đổi.
 * Đếm request THẬT tới BE qua axiosInstance thật (adapter giả) với CÁC HOOK THẬT (khoá thật, tuỳ chọn cache thật).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

vi.mock('../stores/auth.store', () => ({
    useAuthStore: { getState: () => ({ accessToken: null, refreshToken: null, logoutLocal: vi.fn() }), persist: { rehydrate: async () => { } } },
}));
vi.mock('@/components/common/AntdAppProvider', () => ({ showMessage: { error: vi.fn() } }));

import axiosInstance from '../api/axios-instance';
import { departmentsApi } from '../api/departments.api';
import { REF_DATA_SAFETY_STALE_MS, refDataQueryOptions } from '../query-stale';
import { useDepartments, useUpdateDepartment } from './useDepartments';
import { usePositions } from './usePositions';
import { useRoleColors } from './useRoleColorMap';
import { useCustomerStatuses } from './useCustomerStatuses';
import { usePeriodicTaskStatuses } from './usePeriodicTaskStatuses';
import { useLeaveTypes } from './useLeaveTypes';
import { useMediaSources } from './useMediaSources';
import { useRefDataChangeSignal } from './useRefDataChangeSignal';

const calls: Record<string, number> = {};
const count = (route: string) => calls[route] ?? 0;
const total = () => Object.values(calls).reduce((a, b) => a + b, 0);

beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        const route = String(config.url).split('?')[0];
        calls[route] = (calls[route] ?? 0) + 1;
        return { data: [], status: 200, statusText: 'OK', headers: {}, config };
    };
});
afterEach(() => vi.useRealTimers());

// gcTime: 0 trong mặc định để chứng minh tuỳ chọn riêng của danh mục (2 giờ) mới là thứ giữ cache khi rời trang.
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000, gcTime: 0 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

const SIG0 = { departments: 1, positions: 1, roles: 1, customer_statuses: 1, periodic_task_statuses: 1, leave_types: 1, media_sources: 1 };

/** Mount đủ 7 danh mục như 1 phiên làm việc thật + hook tín hiệu. */
function useAllRefData(refSig: Record<string, number>) {
    useDepartments();
    usePositions();
    useRoleColors();
    useCustomerStatuses();
    usePeriodicTaskStatuses();
    useLeaveTypes();
    useMediaSources(false);
    useRefDataChangeSignal(refSig, 7);
}

const ROUTE_OF: Record<string, string> = {
    departments: '/departments',
    positions: '/positions',
    roles: '/roles/colors',
    customer_statuses: '/customer-statuses',
    periodic_task_statuses: '/periodic-task-statuses',
    leave_types: '/leave-types',
    media_sources: '/media-sources',
};

describe('9D - danh mục ít đổi: không hỏi lại, chỉ tải lại khi dữ liệu đổi', () => {
    it('lưới an toàn = 2 giờ', () => {
        expect(REF_DATA_SAFETY_STALE_MS).toBe(2 * 60 * 60 * 1000);
    });

    it('mở phiên: mỗi danh mục đúng 1 GET; nhiều lần poll cùng refSig -> 0 GET thêm', async () => {
        const qc = makeClient();
        const { rerender } = renderHook(({ s }) => useAllRefData(s), { wrapper: wrap(qc), initialProps: { s: SIG0 } });
        await waitFor(() => expect(total()).toBe(7));
        for (let i = 0; i < 5; i++) rerender({ s: { ...SIG0 } });
        await new Promise((r) => setTimeout(r, 30));
        expect(total()).toBe(7);
        for (const route of Object.values(ROUTE_OF)) expect(count(route)).toBe(1);
    });

    for (const [domain, route] of Object.entries(ROUTE_OF)) {
        it(`refSig.${domain} đổi -> ĐÚNG 1 GET ${route}, 6 danh mục còn lại không bị gọi`, async () => {
            const qc = makeClient();
            const { rerender } = renderHook(({ s }) => useAllRefData(s), { wrapper: wrap(qc), initialProps: { s: SIG0 } });
            await waitFor(() => expect(total()).toBe(7));

            rerender({ s: { ...SIG0, [domain]: 2 } });
            await waitFor(() => expect(count(route)).toBe(2));
            await new Promise((r) => setTimeout(r, 30));
            expect(total()).toBe(8);

            rerender({ s: { ...SIG0, [domain]: 2 } }); // poll tiếp theo cùng số -> không tải lại nữa
            await new Promise((r) => setTimeout(r, 30));
            expect(total()).toBe(8);
        });
    }

    it('rời trang rồi quay lại SAU gcTime mặc định (5 phút) vẫn không tải lại', async () => {
        const qc = makeClient(); // gcTime mặc định = 0 ở client này
        const a = renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        await waitFor(() => expect(a.result.current.isLoading).toBe(false));
        a.unmount();
        await new Promise((r) => setTimeout(r, 20));
        const b = renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        await new Promise((r) => setTimeout(r, 30));
        expect(b.result.current.isLoading).toBe(false);
        expect(count('/departments')).toBe(1);
    });

    it('query KHÔNG đang dùng bị đánh dấu cũ bởi refSig -> tải lại ĐÚNG 1 lần ở lần mở trang kế tiếp (không kẹt dữ liệu cũ)', async () => {
        const qc = makeClient();
        const a = renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        const sigHook = renderHook(({ s }) => useRefDataChangeSignal(s, 7), { wrapper: wrap(qc), initialProps: { s: SIG0 as Record<string, number> } });
        await waitFor(() => expect(a.result.current.isLoading).toBe(false));
        a.unmount(); // đang ở trang khác
        sigHook.rerender({ s: { ...SIG0, departments: 2 } });
        await new Promise((r) => setTimeout(r, 30));
        expect(count('/departments')).toBe(1); // không dùng thì chưa gọi

        renderHook(() => useDepartments(), { wrapper: wrap(qc) }); // mở lại trang
        await waitFor(() => expect(count('/departments')).toBe(2));
    });

    it('dùng chung cache với chỗ gọi kiểu chia-data / hộp soạn thông báo (cùng khoá [\'departments\']) -> vẫn 1 GET', async () => {
        const qc = makeClient();
        renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        renderHook(
            () => useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.getAll(), ...refDataQueryOptions() }),
            { wrapper: wrap(qc) },
        );
        await waitFor(() => expect(count('/departments')).toBe(1));
        await new Promise((r) => setTimeout(r, 30));
        expect(count('/departments')).toBe(1);
    });

    it('sửa phòng ban ở CHÍNH máy này -> invalidate -> tải lại ngay (không chờ refSig)', async () => {
        const qc = makeClient();
        const read = renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        await waitFor(() => expect(read.result.current.isLoading).toBe(false));
        const write = renderHook(() => useUpdateDepartment(), { wrapper: wrap(qc) });
        await act(async () => {
            await write.result.current.mutateAsync({ id: 1, data: { name: 'x' } as never });
        });
        await waitFor(() => expect(count('/departments')).toBe(2));
    });

    it('trang quản trị (alwaysFresh): mỗi lần mở tải lại 1 lần để inUseCount đúng; chỗ dùng thường thì không', async () => {
        const qc = makeClient();
        const m1 = renderHook(() => useCustomerStatuses({ alwaysFresh: true }), { wrapper: wrap(qc) });
        await waitFor(() => expect(m1.result.current.isLoading).toBe(false));
        m1.unmount();
        renderHook(() => useCustomerStatuses({ alwaysFresh: true }), { wrapper: wrap(qc) });
        await waitFor(() => expect(count('/customer-statuses')).toBe(2));

        const n1 = renderHook(() => useLeaveTypes(), { wrapper: wrap(qc) });
        await waitFor(() => expect(n1.result.current.isLoading).toBe(false));
        n1.unmount();
        renderHook(() => useLeaveTypes(), { wrapper: wrap(qc) });
        await new Promise((r) => setTimeout(r, 30));
        expect(count('/leave-types')).toBe(1);
    });

    it('BE cũ (không có refSig): không invalidate, vẫn đúng nhờ lưới 2 giờ (hết 2 giờ mới tải lại)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const qc = makeClient();
        const a = renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        await waitFor(() => expect(a.result.current.isLoading).toBe(false));
        a.unmount();

        vi.advanceTimersByTime(REF_DATA_SAFETY_STALE_MS - 60_000);
        const b = renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        await vi.advanceTimersByTimeAsync(50);
        expect(count('/departments')).toBe(1);
        b.unmount();

        vi.advanceTimersByTime(2 * 60_000); // đã quá 2 giờ
        renderHook(() => useDepartments(), { wrapper: wrap(qc) });
        await waitFor(() => expect(count('/departments')).toBe(2));
    });
});
EOF