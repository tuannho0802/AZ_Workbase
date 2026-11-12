import { describe, it, expect } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AntdAppProvider, showMessage } from './AntdAppProvider';

/**
 * Chốt chặn "mưa toast": interceptor axios toast MỌI lỗi non-401. Khi nhiều query song song cùng dính 1 lỗi (vd 403 thiếu quyền),
 * người dùng chỉ được thấy MỘT toast cho mỗi nội dung, không phải N toast chồng nhau.
 */
describe('showMessage - chống trùng toast', () => {
    it('5 lỗi giống hệt nhau cùng lúc -> chỉ 1 toast hiển thị', async () => {
        render(
            <AntdAppProvider>
                <div>app</div>
            </AntdAppProvider>,
        );
        await act(async () => {
            for (let i = 0; i < 5; i++) showMessage.error('Bạn không có quyền thực hiện thao tác này');
        });
        await waitFor(() => expect(screen.getAllByText('Bạn không có quyền thực hiện thao tác này')).toHaveLength(1));
    });

    it('2 lỗi KHÁC nội dung vẫn hiện đủ 2 toast (không nuốt lỗi khác)', async () => {
        render(
            <AntdAppProvider>
                <div>app</div>
            </AntdAppProvider>,
        );
        await act(async () => {
            showMessage.error('Lỗi A');
            showMessage.error('Lỗi B');
        });
        await waitFor(() => {
            expect(screen.getAllByText('Lỗi A')).toHaveLength(1);
            expect(screen.getAllByText('Lỗi B')).toHaveLength(1);
        });
    });
});
