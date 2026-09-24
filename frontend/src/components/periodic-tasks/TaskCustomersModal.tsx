'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Modal, Table, Typography, Alert, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { usePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { Customer } from '@/lib/types/customer.types';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';

const { Text } = Typography;

/** Số dòng/trang của mini table - yêu cầu chủ dự án: tối đa 10. */
export const TASK_CUSTOMERS_PAGE_SIZE = 10;

interface Props {
    open: boolean;
    onClose: () => void;
    task: PeriodicTask | null;
}

/**
 * TaskCustomersModal - danh sách "Khách hàng liên quan" của 1 Công việc dưới dạng
 * mini table (rút gọn từ bảng `/customers`), mở từ nút "Khách hàng (N)" ở
 * `TaskActionsBar` (chỉ hiện khi `task.customerCount > 0`).
 *
 * - Dữ liệu = `linkedCustomers` của `GET /periodic-tasks/:id` (`usePeriodicTask`, chỉ
 *   fetch khi modal mở). BE đã lọc theo phạm vi `customers.view` của người xem nên
 *   FE KHÔNG tự lọc lại.
 * - Phân trang CLIENT-SIDE (`TASK_CUSTOMERS_PAGE_SIZE` = 10): `linkedCustomers` trả
 *   về đủ 1 lần, không có API phân trang riêng.
 * - `linkedCustomers === undefined` = thiếu `customers.view` -> hiện cảnh báo, không
 *   coi là "chưa gắn ai" (mirror `TaskLinksModal`).
 * - Chỉ xem (read-only). Gán/gỡ Khách hàng vẫn làm ở `TaskLinksModal`.
 */
export function TaskCustomersModal({ open, onClose, task }: Props) {
    const { data: detail, isLoading } = usePeriodicTask(open && task ? task.id : null);
    const customers = detail?.linkedCustomers;
    const [page, setPage] = useState(1);

    // Mở modal (hoặc đổi sang Task khác) -> về trang 1.
    useEffect(() => {
        if (open) setPage(1);
    }, [open, task?.id]);

    const columns: ColumnsType<Customer> = useMemo(
        () => [
            {
                title: 'STT',
                key: 'stt',
                width: 50,
                align: 'center',
                render: (_, __, index) => (page - 1) * TASK_CUSTOMERS_PAGE_SIZE + index + 1,
            },
            {
                title: 'Ngày nhập',
                dataIndex: 'inputDate',
                key: 'inputDate',
                width: 100,
                // Hover -> hiện thời điểm TẠO bản ghi thực tế (`createdAt`, có giờ),
                // khác `inputDate` (ngày nghiệp vụ do người dùng nhập/gán).
                render: (date: string | undefined, record) => {
                    const text = date ? dayjs(date).format('DD/MM/YYYY') : '—';
                    const created = record.createdAt ? dayjs(record.createdAt).format('HH:mm DD/MM/YYYY') : null;
                    return created ? (
                        <Tooltip title={`Ngày nhập thực tế: ${created}`}>
                            <span style={{ cursor: 'help' }}>{text}</span>
                        </Tooltip>
                    ) : (
                        text
                    );
                },
            },
            {
                title: 'Họ và tên',
                dataIndex: 'name',
                key: 'name',
                width: 170,
                render: (name: string) => (
                    <Text strong style={{ color: '#1890ff' }}>
                        {name}
                    </Text>
                ),
            },
            {
                title: 'SĐT',
                dataIndex: 'phone',
                key: 'phone',
                width: 115,
                render: (val?: string) =>
                    val ? val : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SDT</span>,
            },
            {
                title: 'Nguồn',
                dataIndex: 'source',
                key: 'source',
                width: 90,
                render: (source?: string) => <SourceTag source={source} />,
            },
            {
                title: 'Sales chính',
                key: 'salesUser',
                width: 140,
                ellipsis: true,
                render: (_, record) => record.salesUser?.fullName || record.salesUser?.name || '—',
            },
            {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 110,
                render: (status?: string) => <StatusTag code={status} fallback="—" />,
            },
        ],
        [page],
    );

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={860}
            destroyOnHidden
            title={task ? `Khách hàng liên quan — ${task.title}` : 'Khách hàng liên quan'}
        >
            {customers === undefined && !isLoading ? (
                <Alert type="warning" showIcon message="Bạn không có quyền xem danh sách Khách hàng." />
            ) : (
                <Table<Customer>
                    size="small"
                    rowKey="id"
                    loading={isLoading}
                    columns={columns}
                    dataSource={customers ?? []}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        current: page,
                        pageSize: TASK_CUSTOMERS_PAGE_SIZE,
                        showSizeChanger: false,
                        hideOnSinglePage: true,
                        showTotal: (total) => `Tổng ${total} khách hàng`,
                        onChange: (p) => setPage(p),
                    }}
                    locale={{ emptyText: 'Chưa gắn Khách hàng nào' }}
                />
            )}
        </Modal>
    );
}
