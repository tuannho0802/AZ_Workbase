'use client';

import React from 'react';
import { Button } from 'antd';
import { useCountdown, formatCountdown } from '@/lib/hooks/useCountdown';

interface BulkUndoToastProps {
    text: string;
    /** Số giây còn lại để hoàn tác (BE trả; hạn thật do đồng hồ DB quyết định). */
    seconds: number;
    busy?: boolean;
    onUndo: () => void;
    /** Hết giờ: nút biến mất và toast tự đóng. */
    onExpire: () => void;
}

/** Nội dung toast "Đã cập nhật N khách hàng — Hoàn tác (còn 4:58)". Hết giờ thì chỉ còn text. */
export function BulkUndoToast({ text, seconds, busy, onUndo, onExpire }: BulkUndoToastProps) {
    const left = useCountdown(seconds, onExpire);
    return (
        <span>
            {text}
            {left > 0 && (
                <>
                    {' — '}
                    <Button type="link" size="small" loading={busy} onClick={onUndo} style={{ padding: 0 }}>
                        Hoàn tác
                    </Button>{' '}
                    <span style={{ opacity: 0.65 }}>(còn {formatCountdown(left)})</span>
                </>
            )}
        </span>
    );
}