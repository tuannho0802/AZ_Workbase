import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { shouldRetryQuery } from '../../lib/query-retry';

// Hàm thường + bộ đếm (KHÔNG dùng vi.fn cho promise bị từ chối: spy tạo promise dẫn xuất không ai bắt -> vitest báo "unhandled rejection" giả).
let getCalls = 0;
const get = () => {
    getCalls++;
    const p = Promise.reject(forbidden());
    p.catch(() => undefined);
    return p;
};
vi.mock('@/lib/api/fanpages.api', async (orig) => ({
    ...(await orig<typeof import('@/lib/api/fanpages.api')>()),
    fanpagesApi: { get: () => get() },
}));
vi.mock('@/lib/hooks/useMyPermissions', () => ({ useMyPermissions: () => ({ can: () => false, scope: () => null, isLoading: false }) }));

import { FanpageDetailDrawer } from './FanpageDetailDrawer';

const forbidden = () =>
    Object.assign(new Error('Request failed with status code 403'), { response: { status: 403, data: { message: 'Bạn không có quyền xem Page này' } } });

/**
 * Mở Drawer cho Page không còn quyền xem (vd link thông báo cũ): trước đây Drawer quay Spin MÃI vì `isLoading=false` và `fanpage=undefined`.
 * Chốt: báo rõ + có nút Đóng, và với 403 chỉ gọi API đúng 1 lần (không retry/loop).
 */
describe('FanpageDetailDrawer - Page tải lỗi (403/404)', () => {
    beforeEach(() => {
        getCalls = 0;
    });

    it('không treo Spin vô hạn: báo rõ + nút Đóng; chỉ gọi API đúng 1 lần', async () => {
        const onClose = vi.fn();
        const qc = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 1 } } });
        render(
            <QueryClientProvider client={qc}>
                <App>
                    <FanpageDetailDrawer fanpageId={99} onClose={onClose} onEdit={vi.fn()} />
                </App>
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByText('Không mở được Page này')).toBeTruthy());
        await new Promise((r) => setTimeout(r, 200));
        expect(getCalls).toBe(1);
        expect(document.querySelector('.ant-spin')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Đóng/ }));
        expect(onClose).toHaveBeenCalled();
    });
});
