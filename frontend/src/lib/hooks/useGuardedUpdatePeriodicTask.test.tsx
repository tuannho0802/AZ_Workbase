import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { App } from 'antd';
import type { ReactNode } from 'react';

const baseMutate = vi.fn();
vi.mock('./usePeriodicTasks', () => ({
    useUpdatePeriodicTask: () => ({ mutate: baseMutate, isPending: false }),
}));

import { useGuardedUpdatePeriodicTask } from './useGuardedUpdatePeriodicTask';

const wrapper = ({ children }: { children: ReactNode }) => <App>{children}</App>;

const guardError = (guard: 'complete' | 'reset') => ({
    response: {
        status: 409,
        data: {
            code: 'CHECKLIST_GUARD',
            guard,
            sync: guard === 'complete' ? 'tick_all' : 'untick_all',
            total: 5,
            done: guard === 'complete' ? 3 : 2,
            targetStatusName: 'Hoàn thành',
        },
    },
});

describe('useGuardedUpdatePeriodicTask', () => {
    beforeEach(() => {
        baseMutate.mockReset();
    });

    it('PATCH thành công ngay (không cần Guard) -> gọi onSuccess, không hỏi', () => {
        baseMutate.mockImplementation((_v, o) => o.onSuccess());
        const { result } = renderHook(() => useGuardedUpdatePeriodicTask(), { wrapper });
        const onSuccess = vi.fn();

        act(() => result.current.mutate({ id: 1, data: { statusId: 4 }, title: 'A' }, { onSuccess }));

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(baseMutate).toHaveBeenCalledTimes(1);
        expect(baseMutate.mock.calls[0][0]).toEqual({ id: 1, data: { statusId: 4 } });
    });

    it('lỗi KHÔNG phải Guard -> chuyển thẳng onError, không hỏi', () => {
        const err = { response: { status: 400, data: { message: 'x' } } };
        baseMutate.mockImplementation((_v, o) => o.onError(err));
        const { result } = renderHook(() => useGuardedUpdatePeriodicTask(), { wrapper });
        const onError = vi.fn();

        act(() => result.current.mutate({ id: 1, data: { statusId: 4 } }, { onError }));

        expect(onError).toHaveBeenCalledWith(err);
        expect(baseMutate).toHaveBeenCalledTimes(1);
    });

    it('409 Guard -> KHÔNG gọi onError (không toast lỗi), hiện hộp thoại "Bạn đã hoàn thành Task?"', async () => {
        baseMutate.mockImplementation((_v, o) => o.onError(guardError('complete')));
        const { result } = renderHook(() => useGuardedUpdatePeriodicTask(), { wrapper });
        const onError = vi.fn();

        act(() => result.current.mutate({ id: 1, data: { statusId: 4 }, title: 'Gọi khách' }, { onError }));

        expect(onError).not.toHaveBeenCalled();
        expect(await screen_findText('Bạn đã hoàn thành Task?')).toBe(true);
    });

    it('chọn "Có" -> gửi lại PATCH kèm checklistSync=tick_all; chọn "Không" -> onCancel, không gửi lại', async () => {
        let call = 0;
        baseMutate.mockImplementation((_v, o) => {
            call += 1;
            if (call === 1) o.onError(guardError('complete'));
            else o.onSuccess();
        });
        const { result } = renderHook(() => useGuardedUpdatePeriodicTask(), { wrapper });
        const onSuccess = vi.fn();

        act(() => result.current.mutate({ id: 1, data: { statusId: 4 }, title: 'A' }, { onSuccess }));
        await clickButton('Có, đã hoàn thành');

        expect(baseMutate).toHaveBeenCalledTimes(2);
        expect(baseMutate.mock.calls[1][0]).toEqual({ id: 1, data: { statusId: 4, checklistSync: 'tick_all' } });
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('chọn "Chưa hoàn thành" -> onCancel, KHÔNG gửi lại PATCH (Task giữ nguyên trạng thái)', async () => {
        baseMutate.mockImplementation((_v, o) => o.onError(guardError('complete')));
        const { result } = renderHook(() => useGuardedUpdatePeriodicTask(), { wrapper });
        const onCancel = vi.fn();
        const onSuccess = vi.fn();

        act(() => result.current.mutate({ id: 1, data: { statusId: 4 }, title: 'A' }, { onCancel, onSuccess }));
        await clickButton('Chưa hoàn thành');

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSuccess).not.toHaveBeenCalled();
        expect(baseMutate).toHaveBeenCalledTimes(1);
    });

    it('Guard "reset" (về To-do) -> chọn "Có, bỏ tick hết" gửi checklistSync=untick_all', async () => {
        let call = 0;
        baseMutate.mockImplementation((_v, o) => {
            call += 1;
            if (call === 1) o.onError(guardError('reset'));
            else o.onSuccess();
        });
        const { result } = renderHook(() => useGuardedUpdatePeriodicTask(), { wrapper });

        act(() => result.current.mutate({ id: 2, data: { statusId: 1 }, title: 'B' }));
        await clickButton('Có, bỏ tick hết');

        expect(baseMutate.mock.calls[1][0]).toEqual({ id: 2, data: { statusId: 1, checklistSync: 'untick_all' } });
    });
});

async function screen_findText(text: string): Promise<boolean> {
    for (let i = 0; i < 20; i += 1) {
        if (document.body.textContent?.includes(text)) return true;
        await act(async () => {
            await new Promise((r) => setTimeout(r, 25));
        });
    }
    return false;
}

async function clickButton(label: string) {
    await screen_findText(label);
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === label.replace(/\s/g, ''));
    if (!btn) throw new Error(`Không thấy nút "${label}"`);
    await act(async () => {
        btn.click();
        await new Promise((r) => setTimeout(r, 25));
    });
}
