'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Alert, Button, Empty, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, ExportOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';
import type { Fanpage, FanpageLeadRow } from '@/lib/api/fanpages.api';
import { customersApi } from '@/lib/api/customers.api';
import { fanpageKeys, useCreateFanpageLead, useFanpageLeads } from '@/lib/hooks/useFanpages';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { buildLeadPayload } from '@/lib/utils/fanpageLead';
import { toastApiError } from '@/lib/utils/error-message.util';
import { FanpageLeadFields, useLeadDuplicateCheck } from './FanpageLeadFields';

const { Text } = Typography;
const PAGE_SIZE = 10;

interface Props {
    fanpage: Fanpage;
}

/**
 * Tab Drawer "Data khách hàng" (PLAN 15.5). Chỉ được RENDER khi người dùng có `customers.view` (Drawer quyết định) - không render
 * rồi báo 403. Số trên nhãn tab, tổng dưới bảng và các dòng đều từ CÙNG 1 truy vấn BE, theo phạm vi `customers.view` của người xem (X32).
 * Sửa/xoá Lead không có endpoint riêng: đi qua trang/endpoint Khách hàng (giữ nguyên quyền + scope + audit của Khách hàng).
 */
export function FanpageLeadsTab({ fanpage }: Props) {
    const { message } = App.useApp();
    const router = useRouter();
    const qc = useQueryClient();
    const { can } = useMyPermissions();
    const { statuses } = useCustomerStatuses();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const [form] = Form.useForm();
    const createMut = useCreateFanpageLead(fanpage.id);
    const confirmNotDuplicate = useLeadDuplicateCheck();

    const { leads, isLoading, isFetching } = useFanpageLeads(fanpage.id, { page, limit: PAGE_SIZE, search: search || undefined }, true);

    const archived = !!fanpage.archivedAt;
    const canCreate = can('customers.create') && !archived;
    const canDelete = can('customers.delete');

    const statusTag = (code: string) => {
        const st = statuses.find((s) => s.code === code);
        return <Tag color={st?.color}>{st?.name ?? code}</Tag>;
    };

    const handleCreate = async () => {
        if (createMut.isPending) return; // chống bấm đúp (15.8 tầng 3)
        const values = await form.validateFields();
        const payload = buildLeadPayload(values);
        if (!(await confirmNotDuplicate(payload.phone, payload.email))) return;
        try {
            await createMut.mutateAsync(payload);
            message.success('Đã thêm khách hàng');
            form.resetFields();
            setOpen(false);
            setPage(1);
        } catch (err) {
            toastApiError(message, err, 'Không thể thêm khách hàng');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await customersApi.deleteCustomer(id);
            message.success('Đã chuyển khách vào Thùng rác');
            await qc.invalidateQueries({ queryKey: fanpageKeys.all });
            await qc.invalidateQueries({ queryKey: ['customers'] });
        } catch (err) {
            toastApiError(message, err, 'Không thể xoá khách hàng');
        }
    };

    const columns: ColumnsType<FanpageLeadRow> = [
        { title: 'Họ và tên', dataIndex: 'name', ellipsis: true, render: (n: string) => <Text strong>{n}</Text> },
        { title: 'SĐT', dataIndex: 'phone', width: 120, render: (v?: string | null) => v ?? '—' },
        { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (c: string) => statusTag(c) },
        { title: 'Sales', width: 130, ellipsis: true, render: (_: unknown, r) => r.salesUser?.name ?? <Text type="secondary">Chưa chia</Text> },
        { title: 'Ngày nhập', dataIndex: 'inputDate', width: 105, render: (d: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '—') },
        { title: 'Nguồn', dataIndex: 'source', width: 100, ellipsis: true },
        {
            title: 'Từ',
            width: 110,
            render: (_: unknown, r) => (r.noteId != null ? <Tag color="purple">Từ ghi chú</Tag> : <Tag>Nhập tay</Tag>),
        },
        {
            title: '',
            width: 120,
            fixed: 'right',
            render: (_: unknown, r) => (
                <Space size={0}>
                    <Tooltip
                        title={
                            <div>
                                <strong>Tạo bởi:</strong> {r.createdBy?.name ?? 'Không xác định'}
                                <br />
                                <span style={{ fontSize: 12, opacity: 0.75 }}>{dayjs(r.createdAt).format('HH:mm DD/MM/YYYY')}</span>
                            </div>
                        }
                    >
                        <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', marginRight: 8 }} />
                    </Tooltip>
                    <Tooltip title="Mở trong Khách hàng (xem/sửa)">
                        <Button type="text" size="small" icon={<ExportOutlined />} onClick={() => router.push(`/customers?id=${r.id}`)} />
                    </Tooltip>
                    {canDelete && (
                        <Popconfirm title="Chuyển khách này vào Thùng rác?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(r.id)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Space orientation="vertical" style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Input.Search
                    allowClear
                    placeholder="Tìm theo tên, SĐT"
                    style={{ width: 240 }}
                    onSearch={(v) => {
                        setSearch(v.trim());
                        setPage(1);
                    }}
                />
                {canCreate && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                        Thêm khách
                    </Button>
                )}
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
                Theo phạm vi dữ liệu của bạn{leads ? ` (${leads.customerScope})` : ''}. Khách ở đây được ghi công cho Page này (ưu tiên hơn UTM) trong bảng Thống kê.
            </Text>
            {archived && <Alert type="info" showIcon title="Page đã lưu trữ — bỏ lưu trữ để thêm khách mới." />}
            <Table<FanpageLeadRow>
                size="small"
                rowKey="id"
                loading={isLoading || isFetching}
                columns={columns}
                dataSource={leads?.data ?? []}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: <Empty description="Chưa có khách nào được nhập từ Page này" /> }}
                pagination={{
                    current: page,
                    pageSize: PAGE_SIZE,
                    total: leads?.total ?? 0,
                    showTotal: (t) => `Tổng ${t} khách`,
                    hideOnSinglePage: true,
                    onChange: setPage,
                }}
            />
            <Modal
                title={`Thêm khách cho “${fanpage.name}”`}
                open={open}
                onCancel={() => setOpen(false)}
                onOk={handleCreate}
                okText="Thêm khách"
                cancelText="Huỷ"
                confirmLoading={createMut.isPending}
                destroyOnHidden
                maskClosable={false}
            >
                <Form form={form} layout="vertical" preserve={false}>
                    <FanpageLeadFields platformName={fanpage.platform?.name} />
                </Form>
            </Modal>
        </Space>
    );
}