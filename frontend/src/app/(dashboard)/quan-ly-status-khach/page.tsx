'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Table,
    Button,
    Tag,
    Space,
    Modal,
    Form,
    Input,
    InputNumber,
    Select,
    App,
    Typography,
    Alert,
    ColorPicker,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LockOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import {
    useCustomerStatuses,
    useCreateCustomerStatus,
    useUpdateCustomerStatus,
    useDeleteCustomerStatus,
} from '@/lib/hooks/useCustomerStatuses';
import { CustomerStatus } from '@/lib/api/customer-statuses.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';

const { Title, Text } = Typography;

export default function CustomerStatusesPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();

    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);

    // Khớp @RequirePermission('customer_statuses.view') ở
    // customer-statuses.controller.ts - mirror đúng route guard của
    // /nguon-media (MediaSourcesPage) và /vi-tri.
    useEffect(() => {
        if (!permissionsLoading && user && !can('customer_statuses.view')) {
            router.replace('/customers');
        }
    }, [user, router]);

    // Khớp @RequirePermission('customer_statuses.manage') / '.delete' -
    // seed sẵn ở migration CreateCustomerStatuses1781400000000: manage =
    // admin + assistant, delete = chỉ admin.
    const canManage = can('customer_statuses.manage');
    const canDelete = can('customer_statuses.delete');

    const { statuses, isLoading } = useCustomerStatuses();
    const createMutation = useCreateCustomerStatus();
    const updateMutation = useUpdateCustomerStatus();
    const deleteMutation = useDeleteCustomerStatus();

    // ---- Modal Thêm/Sửa ----
    const [modalOpen, setModalOpen] = useState(false);
    const [editingStatus, setEditingStatus] = useState<CustomerStatus | null>(null);
    const [form] = Form.useForm();

    const openCreateModal = () => {
        setEditingStatus(null);
        form.resetFields();
        form.setFieldsValue({ color: '#1890ff', sortOrder: 0 });
        setModalOpen(true);
    };

    const openEditModal = (status: CustomerStatus) => {
        setEditingStatus(status);
        form.setFieldsValue({
            code: status.code,
            name: status.name,
            description: status.description ?? undefined,
            color: status.color,
            sortOrder: status.sortOrder,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingStatus) {
                const { code, ...rest } = values; // code bất biến - không gửi lên khi update
                updateMutation.mutate(
                    { id: editingStatus.id, data: rest },
                    {
                        onSuccess: () => {
                            message.success('Đã cập nhật trạng thái');
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Cập nhật thất bại');
                        },
                    },
                );
            } else {
                createMutation.mutate(values, {
                    onSuccess: () => {
                        message.success('Đã thêm trạng thái mới');
                        setModalOpen(false);
                    },
                    onError: (err: any) => {
                        message.error(err?.response?.data?.message || 'Thêm trạng thái thất bại');
                    },
                });
            }
        } catch {
            // lỗi validate form - antd tự hiển thị, không cần xử lý thêm
        }
    };

    // ---- Modal Xoá (kèm chọn fallback nếu đang có customer dùng) ----
    const [deletingStatus, setDeletingStatus] = useState<CustomerStatus | null>(null);
    const [fallbackCode, setFallbackCode] = useState<string | null>(null);

    const openDeleteModal = (status: CustomerStatus) => {
        setDeletingStatus(status);
        setFallbackCode(null);
    };

    const closeDeleteModal = () => {
        setDeletingStatus(null);
        setFallbackCode(null);
    };

    // Danh sách chọn fallback: mọi trạng thái KHÁC trạng thái đang xoá (kể cả
    // trạng thái hệ thống - hoàn toàn hợp lệ để fallback VỀ 1 status hệ thống,
    // chỉ không được XOÁ status hệ thống - xem BE `remove()`).
    const fallbackOptions = useMemo(
        () =>
            statuses
                .filter((s) => s.id !== deletingStatus?.id)
                .map((s) => ({ value: s.code, label: s.name, color: s.color })),
        [statuses, deletingStatus],
    );

    const needsFallback = (deletingStatus?.inUseCount ?? 0) > 0;

    const handleConfirmDelete = () => {
        if (!deletingStatus) return;
        if (needsFallback && !fallbackCode) {
            message.warning('Vui lòng chọn trạng thái thay thế trước khi xoá');
            return;
        }
        deleteMutation.mutate(
            { id: deletingStatus.id, fallbackCode: fallbackCode ?? undefined },
            {
                onSuccess: (res) => {
                    message.success(
                        res.reassignedCount > 0
                            ? `Đã xoá "${deletingStatus.name}" và chuyển ${res.reassignedCount} khách hàng sang trạng thái thay thế`
                            : `Đã xoá "${deletingStatus.name}"`,
                    );
                    closeDeleteModal();
                },
                onError: (err: any) => {
                    message.error(err?.response?.data?.message || 'Xoá thất bại');
                },
            },
        );
    };

    const columns = [
        {
            title: 'Trạng thái',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: CustomerStatus) => (
                <Space>
                    <Tag color={record.color} style={{ marginRight: 0 }}>
                        {name}
                    </Tag>
                    {record.isSystem && (
                        <Tag icon={<LockOutlined />} color="default">
                            Hệ thống
                        </Tag>
                    )}
                </Space>
            ),
        },
        {
            title: 'Mã (code)',
            dataIndex: 'code',
            key: 'code',
            width: 160,
            render: (code: string) => <Text code>{code}</Text>,
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (description?: string | null) => description || '-',
        },
        {
            title: 'Đang dùng',
            dataIndex: 'inUseCount',
            key: 'inUseCount',
            width: 130,
            align: 'center' as const,
            render: (count: number) =>
                count > 0 ? <Tag color="blue">{count} khách hàng</Tag> : <Text type="secondary">-</Text>,
        },
        {
            title: 'Thứ tự hiển thị',
            dataIndex: 'sortOrder',
            key: 'sortOrder',
            width: 140,
        },
        ...((canManage || canDelete)
            ? [
                {
                    title: 'Thao tác',
                    key: 'action',
                    width: 200,
                    render: (_: any, record: CustomerStatus) => (
                        <Space>
                            {canManage && (
                                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                                    Sửa
                                </Button>
                            )}
                            {canDelete && !record.isSystem && (
                                <Button
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => openDeleteModal(record)}
                                >
                                    Xoá
                                </Button>
                            )}
                        </Space>
                    ),
                },
            ]
            : []),
    ];

    return (
        <div style={{ padding: 24 }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16,
                }}
            >
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        Quản lý Status khách
                    </Title>
                    <Text type="secondary">
                        Danh sách trạng thái hiển thị trong dropdown "Trạng thái" khi thêm/sửa khách hàng. Trạng
                        thái hệ thống (9 trạng thái mặc định) chỉ sửa được tên/màu/mô tả, không xoá được. Trạng
                        thái tuỳ chỉnh có thể xoá, nhưng nếu đang có khách hàng dùng sẽ cần chọn trạng thái thay
                        thế để chuyển dữ liệu trước khi xoá.
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                        Thêm trạng thái mới
                    </Button>
                )}
            </div>

            <Table
                rowKey="id"
                loading={isLoading}
                columns={columns}
                dataSource={statuses}
                pagination={false}
            />

            {/* Modal Thêm/Sửa */}
            <Modal
                title={editingStatus ? `Sửa trạng thái "${editingStatus.name}"` : 'Thêm trạng thái mới'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
            >
                {editingStatus?.isSystem && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        title="Đây là trạng thái hệ thống - chỉ sửa được tên/màu/mô tả/thứ tự, mã (code) giữ nguyên."
                    />
                )}
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="code"
                        label="Mã trạng thái (code)"
                        tooltip="Giá trị THẬT lưu vào dữ liệu khách hàng - không đổi được sau khi tạo"
                        rules={[
                            { required: true, message: 'Vui lòng nhập mã trạng thái' },
                            {
                                pattern: /^[a-z0-9_]+$/,
                                message: 'Chỉ chữ thường, số và dấu gạch dưới (vd: callback_later)',
                            },
                            { max: 50, message: 'Mã trạng thái tối đa 50 ký tự' },
                        ]}
                    >
                        <Input placeholder="vd: callback_later" disabled={!!editingStatus} />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Tên hiển thị"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên trạng thái' },
                            { max: 100, message: 'Tên trạng thái tối đa 100 ký tự' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Liên hệ lại sau" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Mô tả"
                        rules={[{ max: 255, message: 'Mô tả tối đa 255 ký tự' }]}
                    >
                        <Input.TextArea placeholder="Ghi chú ngắn về ý nghĩa trạng thái này (không bắt buộc)" rows={2} />
                    </Form.Item>
                    <Form.Item
                        name="color"
                        label="Màu hiển thị"
                        rules={[{ required: true, message: 'Vui lòng chọn màu' }]}
                        getValueFromEvent={(color) =>
                            typeof color === 'string' ? color : color?.toHexString?.() ?? color
                        }
                    >
                        <ColorPicker showText format="hex" />
                    </Form.Item>
                    <Form.Item name="sortOrder" label="Thứ tự hiển thị (số nhỏ hơn hiện trước)">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Xoá - kèm chọn fallback nếu đang có customer dùng */}
            <Modal
                title={`Xoá trạng thái "${deletingStatus?.name ?? ''}"?`}
                open={!!deletingStatus}
                onCancel={closeDeleteModal}
                onOk={handleConfirmDelete}
                okButtonProps={{ danger: true, disabled: needsFallback && !fallbackCode }}
                okText="Xoá"
                cancelText="Huỷ"
                confirmLoading={deleteMutation.isPending}
            >
                {needsFallback ? (
                    <>
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16 }}
                            title={`Đang có ${deletingStatus?.inUseCount} khách hàng dùng trạng thái này`}
                            description="Chọn trạng thái thay thế bên dưới - toàn bộ khách hàng đang dùng trạng thái này sẽ được tự động chuyển sang trạng thái bạn chọn trước khi trạng thái cũ bị xoá."
                        />
                        <Text strong>Chuyển sang trạng thái:</Text>
                        <Select
                            style={{ width: '100%', marginTop: 8 }}
                            placeholder="Chọn trạng thái thay thế"
                            value={fallbackCode ?? undefined}
                            onChange={(value) => setFallbackCode(value)}
                            options={fallbackOptions.map((opt) => ({
                                value: opt.value,
                                label: (
                                    <Tag color={opt.color} style={{ marginRight: 0 }}>
                                        {opt.label}
                                    </Tag>
                                ),
                            }))}
                        />
                    </>
                ) : (
                    <Text>Không có khách hàng nào đang dùng trạng thái này. Bạn có chắc muốn xoá?</Text>
                )}
            </Modal>
        </div>
    );
}