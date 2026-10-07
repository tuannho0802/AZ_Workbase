import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const refreshAll = vi.fn().mockResolvedValue(undefined);
vi.mock('../system-refresh', () => ({ refreshAllClientCaches: (...a: unknown[]) => refreshAll(...a) }));

import {
    useSystemEpochSignal,
    acknowledgeSystemEpoch,
    resetSystemEpochAcknowledgement,
    SYSTEM_EPOCH_JITTER_MAX_MS,
} from './useSystemEpochSignal';

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
const run = () => vi.advanceTimersByTime(SYSTEM_EPOCH_JITTER_MAX_MS + 1);

describe('useSystemEpochSignal (Reset hệ thống)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        queryClient = new QueryClient();
        refreshAll.mockClear();
        resetSystemEpochAcknowledgement();
    });
    afterEach(() => vi.useRealTimers());

    it('lần đầu thấy epoch: chỉ ghi mốc, KHÔNG làm mới', () => {
        renderHook(() => useSystemEpochSignal(3, 7), { wrapper });
        run();
        expect(refreshAll).not.toHaveBeenCalled();
    });

    it('epoch không đổi giữa các lần poll: không làm gì', () => {
        const { rerender } = renderHook(({ e }) => useSystemEpochSignal(e, 7), { wrapper, initialProps: { e: 3 } });
        rerender({ e: 3 });
        run();
        expect(refreshAll).not.toHaveBeenCalled();
    });

    it('epoch tăng: làm mới toàn bộ đúng 1 lần, sau jitter (không làm ngay lập tức hàng loạt)', () => {
        const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const { rerender } = renderHook(({ e }) => useSystemEpochSignal(e, 7), { wrapper, initialProps: { e: 3 } });
        rerender({ e: 4 });
        expect(refreshAll).not.toHaveBeenCalled();
        vi.advanceTimersByTime(SYSTEM_EPOCH_JITTER_MAX_MS * 0.5 - 1);
        expect(refreshAll).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2);
        expect(refreshAll).toHaveBeenCalledTimes(1);
        expect(refreshAll).toHaveBeenCalledWith(queryClient);
        rerender({ e: 4 });
        rerender({ e: 4 });
        run();
        expect(refreshAll).toHaveBeenCalledTimes(1);
        rnd.mockRestore();
    });

    it('chính máy bấm Reset đã acknowledge epoch -> poll báo lại KHÔNG làm mới lần 2', () => {
        const { rerender } = renderHook(({ e }) => useSystemEpochSignal(e, 7), { wrapper, initialProps: { e: 3 } });
        acknowledgeSystemEpoch(4);
        rerender({ e: 4 });
        run();
        expect(refreshAll).not.toHaveBeenCalled();
    });

    it('acknowledge xảy ra TRONG lúc đang chờ jitter -> huỷ lần làm mới', () => {
        const { rerender } = renderHook(({ e }) => useSystemEpochSignal(e, 7), { wrapper, initialProps: { e: 3 } });
        rerender({ e: 4 });
        acknowledgeSystemEpoch(4);
        run();
        expect(refreshAll).not.toHaveBeenCalled();
    });

    it('Reset lần nữa (epoch khác epoch đã acknowledge) vẫn làm mới', () => {
        const { rerender } = renderHook(({ e }) => useSystemEpochSignal(e, 7), { wrapper, initialProps: { e: 3 } });
        acknowledgeSystemEpoch(4);
        rerender({ e: 4 });
        rerender({ e: 5 });
        run();
        expect(refreshAll).toHaveBeenCalledTimes(1);
    });

    it('đổi user đăng nhập: đặt lại mốc, KHÔNG coi là Reset', () => {
        const { rerender } = renderHook(({ e, u }) => useSystemEpochSignal(e, u), { wrapper, initialProps: { e: 3, u: 7 } });
        rerender({ e: 9, u: 8 });
        run();
        expect(refreshAll).not.toHaveBeenCalled();
    });

    it('BE cũ chưa trả epoch (undefined) hoặc 1 lần poll thiếu: bỏ qua, GIỮ mốc cũ', () => {
        const { rerender } = renderHook(({ e }) => useSystemEpochSignal(e, 7), { wrapper, initialProps: { e: 3 as number | undefined } });
        rerender({ e: undefined });
        run();
        expect(refreshAll).not.toHaveBeenCalled();
        rerender({ e: 4 });
        run();
        expect(refreshAll).toHaveBeenCalledTimes(1);
    });
});
