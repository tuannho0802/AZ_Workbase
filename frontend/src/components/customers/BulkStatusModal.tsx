'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Select, Typography, App, Alert } from 'antd';
import { customersApi } from '@/lib/api/customers.api';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useBulkUndoToast } from '@/lib/hooks/useBulkUndoToast';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface BulkStatusModalProps {
    open: boolean;
    selectedRowKeys: React.Key[];
    onClose: () => void;
    /** Gọi khi có thay đổi dữ liệu (đổi xong hoặc hoàn tác xong) để trang tải lại. */
    onSuccess: () => void;
}

/** Đổi trạng thái nhiều khách hàng cùng lúc (PLAN P7) - kèm toast Hoàn tác 5 phút. */
export function BulkStatusModal({ open, selectedRowKeys, onClose, onSuccess }: BulkStatusModalProps) {
    const { message } = App.useApp();
    const { statuses } = useCustomerStatuses();
    const showUndoToast = useBulkUndoToast();
    const [status, setStatus] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) setStatus(undefined);
    }, [open]);

    const handleSubmit = async () => {
        if (!status || loading) return;
        setLoading(true);
        try {
            const res = await customersApi.bulkStatus(selectedRowKeys.map(Number), status);
            const parts: string[] = [];
            if (res.unchanged.length > 0) parts.push(`${res.unchanged.length} đã đúng trạng thái`);
            if (res.failed.length > 0) parts.push(`${res.failed.length} không đổi được`);
            const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';

            if (res.succeeded.length > 0) {
                showUndoToast({
                    operationId: res.operationId,
                    undoExpiresInSeconds: res.undoExpiresInSeconds,
                    text: `Đã cập nhật ${res.succeeded.length} khách hàng${suffix}`,
                    onUndone: onSuccess,
                });
            } else if (res.failed.length > 0) {
                message.warning(`Không đổi được khách nào: ${res.failed[0].reason}`);
            } else {
                message.info(`Các khách đã chọn đều đang ở trạng thái này${suffix}`);
            }
            onSuccess();
            onClose();
        } catch (e) {
            toastApiError(message, e, 'Lỗi đổi trạng thái hàng loạt');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            title={`Đổi trạng thái (${selectedRowKeys.length} khách hàng)`}
            onCancel={onClose}
            onOk={handleSubmit}
            okText="Đổi trạng thái"
            cancelText="Hủy"
            okButtonProps={{ disabled: !status, loading }}
            destroyOnHidden
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Text>Trạng thái mới</Text>
                <Select
                    placeholder="Chọn trạng thái"
                    value={status}
                    onChange={setStatus}
                    options={statuses.map((s) => ({ value: s.code, label: s.name }))}
                    style={{ width: '100%' }}
                />
                <Alert type="info" showIcon message="Bạn có 5 phút để Hoàn tác sau khi đổi." />
            </div>
        </Modal>
    );
}