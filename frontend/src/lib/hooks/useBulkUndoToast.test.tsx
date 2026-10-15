import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { useBulkUndoToast } from './useBulkUndoToast';

if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
        matches: false, media: q, onchange: null,
        addListener: () => { }, removeListener: () => { },
        addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

const undo = vi.fn();
vi.mock('@/lib/api/bulk-operations.api', () => ({ bulkOperationsApi: { undo: (...a: unknown[]) => undo(...a) } }));

function Harness(props: { operationId: number | null; seconds: number | null; onUndone?: () => void }) {
    const show = useBulkUndoToast();
    return (
        <button
            onClick={() =>
                show({ operationId: props.operationId, undoExpiresInSeconds: props.seconds, text: 'Đã cập nhật 2 khách hàng', onUndone: props.onUndone })
            }
        >
            go
        </button>
    );
}
const renderHarness = (p: Parameters<typeof Harness>[0]) =>
    render(
        <App>
            <Harness {...p} />
        </App>,
    );

describe('useBulkUndoToast', () => {
    beforeEach(() => undo.mockReset());

    it('không có operationId -> toast thường, KHÔNG có nút Hoàn tác', async () => {
        renderHarness({ operationId: null, seconds: null });
        fireEvent.click(screen.getByText('go'));
        await screen.findByText('Đã cập nhật 2 khách hàng');
        expect(screen.queryByRole('button', { name: /Hoàn tác/ })).toBeNull();
    });

    it('có operationId -> bấm Hoàn tác gọi API, báo kết quả và gọi onUndone', async () => {
        undo.mockResolvedValue({ restored: 2, skipped: [] });
        const onUndone = vi.fn();
        renderHarness({ operationId: 11, seconds: 300, onUndone });
        fireEvent.click(screen.getByText('go'));
        fireEvent.click(await screen.findByRole('button', { name: /Hoàn tác/ }));
        await waitFor(() => expect(undo).toHaveBeenCalledWith(11));
        await screen.findByText('Đã hoàn tác 2 khách hàng');
        expect(onUndone).toHaveBeenCalledTimes(1);
    });

    it('có khách bị bỏ qua -> cảnh báo kèm số lượng và lý do', async () => {
        undo.mockResolvedValue({ restored: 1, skipped: [{ id: 5, reason: 'Khách hàng đã vào Thùng rác' }] });
        renderHarness({ operationId: 12, seconds: 300 });
        fireEvent.click(screen.getByText('go'));
        fireEvent.click(await screen.findByRole('button', { name: /Hoàn tác/ }));
        await screen.findByText(/bỏ qua 1.*Khách hàng đã vào Thùng rác/);
    });

    it('API lỗi (vd 410 quá hạn) -> không báo thành công, vẫn tải lại dữ liệu', async () => {
        undo.mockRejectedValue(new Error('gone'));
        const onUndone = vi.fn();
        renderHarness({ operationId: 13, seconds: 300, onUndone });
        fireEvent.click(screen.getByText('go'));
        fireEvent.click(await screen.findByRole('button', { name: /Hoàn tác/ }));
        await waitFor(() => expect(onUndone).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(/Đã hoàn tác/)).toBeNull();
    });
});