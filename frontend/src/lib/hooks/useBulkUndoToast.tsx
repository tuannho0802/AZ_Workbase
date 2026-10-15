'use client';

import React, { useCallback } from 'react';
import { App } from 'antd';
import { BulkUndoToast } from '@/components/common/BulkUndoToast';
import { bulkOperationsApi } from '@/lib/api/bulk-operations.api';
import { toastApiError } from '@/lib/utils/error-message.util';

interface ShowUndoToastArgs {
    operationId: number | null | undefined;
    undoExpiresInSeconds: number | null | undefined;
    /** Câu hiển thị, vd "Đã cập nhật 12 khách hàng". */
    text: string;
    /** Gọi sau khi hoàn tác xong (kể cả khi có khách bị bỏ qua) để tải lại dữ liệu. */
    onUndone?: () => void;
}

/**
 * Toast thao tác hàng loạt có nút Hoàn tác + đếm ngược (PLAN P7). Không có `operationId`/số giây
 * (không khách nào bị đổi) -> chỉ toast thường, KHÔNG hiện nút.
 */
export function useBulkUndoToast() {
    const { message } = App.useApp();

    return useCallback(
        ({ operationId, undoExpiresInSeconds, text, onUndone }: ShowUndoToastArgs) => {
            if (!operationId || !undoExpiresInSeconds || undoExpiresInSeconds <= 0) {
                message.success(text);
                return;
            }
            const key = `bulk-undo-${operationId}`;
            let busy = false;

            const render = (isBusy: boolean) =>
                message.open({
                    key,
                    type: 'success',
                    duration: 0,
                    content: (
                        <BulkUndoToast
                            text={text}
                            seconds={undoExpiresInSeconds}
                            busy={isBusy}
                            onExpire={() => message.destroy(key)}
                            onUndo={async () => {
                                if (busy) return;
                                busy = true;
                                render(true);
                                try {
                                    const res = await bulkOperationsApi.undo(operationId);
                                    message.destroy(key);
                                    if (res.skipped.length > 0) {
                                        message.warning(
                                            `Đã hoàn tác ${res.restored} khách hàng; bỏ qua ${res.skipped.length} (đã bị sửa sau thao tác hoặc không còn). ${res.skipped[0].reason}`,
                                            8,
                                        );
                                    } else {
                                        message.success(`Đã hoàn tác ${res.restored} khách hàng`);
                                    }
                                    onUndone?.();
                                } catch (e) {
                                    message.destroy(key);
                                    toastApiError(message, e, 'Không thể hoàn tác');
                                    // 409/410 => dữ liệu trên màn hình có thể đã cũ; tải lại cho chắc.
                                    onUndone?.();
                                } finally {
                                    busy = false;
                                }
                            }}
                        />
                    ),
                });
            render(false);
        },
        [message],
    );
}