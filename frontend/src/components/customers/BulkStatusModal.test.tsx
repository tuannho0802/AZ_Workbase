import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { BulkStatusModal } from './BulkStatusModal';

if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
        matches: false, media: q, onchange: null,
        addListener: () => { }, removeListener: () => { },
        addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

const bulkStatus = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({ customersApi: { bulkStatus: (...a: unknown[]) => bulkStatus(...a) } }));
vi.mock('@/lib/hooks/useCustomerStatuses', () => ({
    useCustomerStatuses: () => ({ statuses: [{ code: 'closed', name: 'Đã chốt' }, { code: 'lost', name: 'Mất' }] }),
}));
const showUndo = vi.fn();
vi.mock('@/lib/hooks/useBulkUndoToast', () => ({ useBulkUndoToast: () => showUndo }));

function renderModal(props: Partial<React.ComponentProps<typeof BulkStatusModal>> = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(
        <App>
            <BulkStatusModal open selectedRowKeys={[1, 2, 3]} onClose={onClose} onSuccess={onSuccess} {...props} />
        </App>,
    );
    return { onClose, onSuccess };
}

describe('BulkStatusModal', () => {
    beforeEach(() => {
        bulkStatus.mockReset();
        showUndo.mockReset();
    });

    it('nút xác nhận bị khoá khi chưa chọn trạng thái', () => {
        renderModal();
        expect(screen.getByRole('button', { name: /Đổi trạng thái$/ })).toBeDisabled();
        expect(screen.getByText(/3 khách hàng/)).toBeInTheDocument();
    });

    it('chọn trạng thái -> gọi API với id dạng số, hiện toast Hoàn tác, đóng modal', async () => {
        bulkStatus.mockResolvedValue({ succeeded: [1, 2], unchanged: [3], failed: [], operationId: 9, undoExpiresInSeconds: 300 });
        const { onClose, onSuccess } = renderModal();
        fireEvent.mouseDown(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('Đã chốt'));
        fireEvent.click(screen.getByRole('button', { name: /Đổi trạng thái$/ }));
        await waitFor(() => expect(bulkStatus).toHaveBeenCalledWith([1, 2, 3], 'closed'));
        await waitFor(() => expect(showUndo).toHaveBeenCalled());
        const arg = showUndo.mock.calls[0][0];
        expect(arg).toMatchObject({ operationId: 9, undoExpiresInSeconds: 300 });
        expect(arg.text).toContain('Đã cập nhật 2 khách hàng');
        expect(arg.text).toContain('1 đã đúng trạng thái');
        expect(onSuccess).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('không khách nào đổi được -> KHÔNG hiện toast Hoàn tác', async () => {
        bulkStatus.mockResolvedValue({ succeeded: [], unchanged: [], failed: [{ id: 1, reason: 'Ngoài phạm vi' }], operationId: null, undoExpiresInSeconds: null });
        renderModal();
        fireEvent.mouseDown(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('Mất'));
        fireEvent.click(screen.getByRole('button', { name: /Đổi trạng thái$/ }));
        await screen.findByText(/Không đổi được khách nào: Ngoài phạm vi/);
        expect(showUndo).not.toHaveBeenCalled();
    });
});