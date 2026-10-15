import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BulkUndoToast } from './BulkUndoToast';

describe('BulkUndoToast', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('hiện nút Hoàn tác + đếm ngược mm:ss', () => {
        render(<BulkUndoToast text="Đã cập nhật 3 khách hàng" seconds={298} onUndo={() => { }} onExpire={() => { }} />);
        expect(screen.getByText(/Đã cập nhật 3 khách hàng/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Hoàn tác/ })).toBeInTheDocument();
        expect(screen.getByText(/còn 04:58/)).toBeInTheDocument();
    });

    it('bấm Hoàn tác gọi onUndo', () => {
        const onUndo = vi.fn();
        render(<BulkUndoToast text="x" seconds={60} onUndo={onUndo} onExpire={() => { }} />);
        fireEvent.click(screen.getByRole('button', { name: /Hoàn tác/ }));
        expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('hết giờ: nút biến mất và gọi onExpire đúng 1 lần', () => {
        const onExpire = vi.fn();
        render(<BulkUndoToast text="x" seconds={2} onUndo={() => { }} onExpire={onExpire} />);
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(screen.queryByRole('button', { name: /Hoàn tác/ })).toBeNull();
        expect(onExpire).toHaveBeenCalledTimes(1);
    });
});