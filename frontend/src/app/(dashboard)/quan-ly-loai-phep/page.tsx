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
    Switch,
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
    useLeaveTypes,
    useCreateLeaveType,
    useUpdateLeaveType,
    useDeleteLeaveType,
} from '@/lib/hooks/useLeaveTypes';
import { LeaveType } from '@/lib/api/leave-types.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';

const { Title, Text } = Typography;

/**
 * Ký hiệu chấm công tương ứng (xem AttendanceMonthlyTab.tsx) - CHỈ để hiển
 * thị minh hoạ ở trang này, KHÔNG lưu vào DB. Suy ra động từ 2 cờ isPaid +
 * "thời lượng nửa ngày/cả ngày" mà người dùng chọn khi tạo đơn nghỉ phép
 * (leave_requests.duration), không phải thuộc tính cố định của LeaveType.
 */
function attendanceSymbols(isPaid: boolean): { fullDay: string; halfDay: string } {
    return isPaid ? { fullDay: 'P', halfDay: 'X/2' } : { fullDay: 'KL', halfDay: '1/2K' };
}

export default function LeaveTypesPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();

    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);

    // Khớp @RequirePermission('leave_types.view') ở leave-types.controller.ts
    // - mirror đúng route guard của /quan-ly-status-khach.
    useEffect(() => {
        if (!permissionsLoading && user && !can('leave_types.view')) {
            router.replace('/nghi-phep');
        }
    }, [user, router]);

    // Khớp @RequirePermission('leave_types.manage') / '.delete' - seed sẵn ở
    // migration CreateLeaveTypes1781500000000: manage = admin + assistant,
    // delete = chỉ admin.
    const canManage = can('leave_types.manage');
    const canDelete = can('leave_types.delete');

    const { leaveTypes, isLoading } = useLeaveTypes();
    const createMutation = useCreateLeaveType();
    const updateMutation = useUpdateLeaveType();
    const deleteMutation = useDeleteLeaveType();

    // ---- Modal Thêm/Sửa ----
    const [modalOpen, setModalOpen] = useState(false);
    const [editingType, setEditingType] = useState<LeaveType | null>(null);
    const [form] = Form.useForm();

    const openCreateModal = () => {
        setEditingType(null);
        form.resetFields();
        form.setFieldsValue({ color: '#1890ff', sortOrder: 0, isPaid: true, deductsAnnualBalance: false });
        setModalOpen(true);
    };

    const openEditModal = (type: LeaveType) => {
        setEditingType(type);
        form.setFieldsValue({
            code: type.code,
            name: type.name,
            description: type.description ?? undefined,
            color: type.color,
            isPaid: type.isPaid,
            deductsAnnualBalance: type.deductsAnnualBalance,
            sortOrder: type.sortOrder,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingType) {
                const { code, ...rest } = values; // code bất biến - không gửi lên khi update
                updateMutation.mutate(
                    { id: editingType.id, data: rest },
                    {
                        onSuccess: () => {
                            message.success('Đã cập nhật loại phép');
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
                        message.success('Đã thêm loại phép mới');
                        setModalOpen(false);
                    },
                    onError: (err: any) => {
                        message.error(err?.response?.data?.message || 'Thêm loại phép thất bại');
                    },
                });
            }
        } catch {
            // lỗi validate form - antd tự hiển thị, không cần xử lý thêm
        }
    };

    // ---- Modal Xoá (kèm chọn fallback nếu đang có đơn dùng) ----
    const [deletingType, setDeletingType] = useState<LeaveType | null>(null);
    const [fallbackCode, setFallbackCode] = useState<string | null>(null);

    const openDeleteModal = (type: LeaveType) => {
        setDeletingType(type);
        setFallbackCode(null);
    };

    const closeDeleteModal = () => {
        setDeletingType(null);
        setFallbackCode(null);
    };

    // Danh sách chọn fallback: mọi loại phép KHÁC loại đang xoá (kể cả loại
    // hệ thống - hoàn toàn hợp lệ để fallback VỀ 1 loại hệ thống, chỉ không
    // được XOÁ loại hệ thống - xem BE `remove()`).
    const fallbackOptions = useMemo(
        () =>
            leaveTypes
                .filter((t) => t.id !== deletingType?.id)
                .map((t) => ({ value: t.code, label: t.name, color: t.color })),
        [leaveTypes, deletingType],
    );

    const needsFallback = (deletingType?.inUseCount ?? 0) > 0;

    const handleConfirmDelete = () => {
        if (!deletingType) return;
        if (needsFallback && !fallbackCode) {
            message.warning('Vui lòng chọn loại phép thay thế trước khi xoá');
            return;
        }
        deleteMutation.mutate(
            { id: deletingType.id, fallbackCode: fallbackCode ?? undefined },
            {
                onSuccess: (res) => {
                    message.success(
                        res.reassignedCount > 0
                            ? `Đã xoá "${deletingType.name}" và chuyển ${res.reassignedCount} đơn nghỉ phép sang loại thay thế`
                            : `Đã xoá "${deletingType.name}"`,
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
            title: 'Loại phép',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: LeaveType) => (
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
            title: 'Hưởng lương',
            dataIndex: 'isPaid',
            key: 'isPaid',
            width: 130,
            align: 'center' as const,
            render: (isPaid: boolean) =>
                isPaid ? <Tag color="green">Có lương</Tag> : <Tag color="red">Không lương</Tag>,
        },
        {
            title: 'Ký hiệu chấm công',
            key: 'symbols',
            width: 170,
            align: 'center' as const,
            render: (_: any, record: LeaveType) => {
                const { fullDay, halfDay } = attendanceSymbols(record.isPaid);
                return (
                    <Space size={4}>
                        <Tag color={record.color}>{fullDay}</Tag>
                        <Text type="secondary">/</Text>
                        <Tag color={record.color}>{halfDay}</Tag>
                    </Space>
                );
            },
        },
        {
            title: 'Trừ phép năm',
            dataIndex: 'deductsAnnualBalance',
            key: 'deductsAnnualBalance',
            width: 120,
            align: 'center' as const,
            render: (deducts: boolean) => (deducts ? <Tag color="blue">Có</Tag> : <Text type="secondary">-</Text>),
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
                count > 0 ? <Tag color="blue">{count} đơn</Tag> : <Text type="secondary">-</Text>,
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
                    render: (_: any, record: LeaveType) => (
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
                        Quản lý Loại đơn nghỉ phép
                    </Title>
                    <Text type="secondary">
                        Danh sách loại phép hiển thị trong dropdown "Loại phép" khi tạo đơn nghỉ phép. Loại phép
                        hệ thống (Phép năm, Nghỉ ốm, Thai sản, Nghỉ không lương, Nghỉ bù, Gặp khách, Đi trễ) chỉ
                        sửa được tên/màu/mô tả/hưởng lương, không xoá được. Loại phép tuỳ chỉnh có thể xoá, nhưng
                        nếu đang có đơn nghỉ phép dùng sẽ cần chọn loại thay thế để chuyển dữ liệu trước khi xoá.
                        Cờ "Hưởng lương" quyết định ký hiệu hiển thị ở bảng Tổng hợp chấm công: hưởng lương ⇒{' '}
                        <Text code>P</Text> (cả ngày) / <Text code>X/2</Text> (nửa ngày); không lương ⇒{' '}
                        <Text code>KL</Text> (cả ngày) / <Text code>1/2K</Text> (nửa ngày).
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                        Thêm loại phép mới
                    </Button>
                )}
            </div>

            <Table
                rowKey="id"
                loading={isLoading}
                columns={columns}
                dataSource={leaveTypes}
                pagination={false}
            />

            {/* Modal Thêm/Sửa */}
            <Modal
                title={editingType ? `Sửa loại phép "${editingType.name}"` : 'Thêm loại phép mới'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
            >
                {editingType?.isSystem && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        title="Đây là loại phép hệ thống - chỉ sửa được tên/màu/mô tả/hưởng lương/thứ tự, mã (code) giữ nguyên."
                    />
                )}
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="code"
                        label="Mã loại phép (code)"
                        tooltip="Giá trị THẬT lưu vào cột leave_type của đơn nghỉ phép - không đổi được sau khi tạo"
                        rules={[
                            { required: true, message: 'Vui lòng nhập mã loại phép' },
                            {
                                pattern: /^[a-z0-9_]+$/,
                                message: 'Chỉ chữ thường, số và dấu gạch dưới (vd: meet_client)',
                            },
                            { max: 50, message: 'Mã loại phép tối đa 50 ký tự' },
                        ]}
                    >
                        <Input placeholder="vd: meet_client" disabled={!!editingType} />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Tên hiển thị"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên loại phép' },
                            { max: 100, message: 'Tên loại phép tối đa 100 ký tự' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Gặp khách" />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Mô tả"
                        rules={[{ max: 255, message: 'Mô tả tối đa 255 ký tự' }]}
                    >
                        <Input.TextArea placeholder="Ghi chú ngắn về ý nghĩa loại phép này (không bắt buộc)" rows={2} />
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
                    <Form.Item
                        name="isPaid"
                        label="Hưởng lương"
                        tooltip="Quyết định ký hiệu chấm công: có lương -> P/X-2, không lương -> KL/1-2K"
                        valuePropName="checked"
                    >
                        <Switch checkedChildren="Có lương" unCheckedChildren="Không lương" />
                    </Form.Item>
                    <Form.Item
                        name="deductsAnnualBalance"
                        label="Trừ phép năm khi được duyệt"
                        tooltip="Nếu bật, mỗi đơn dùng loại phép này khi được duyệt sẽ trừ vào số ngày phép năm còn lại của nhân viên"
                        valuePropName="checked"
                    >
                        <Switch checkedChildren="Có trừ" unCheckedChildren="Không trừ" />
                    </Form.Item>
                    <Form.Item name="sortOrder" label="Thứ tự hiển thị (số nhỏ hơn hiện trước)">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Xoá - kèm chọn fallback nếu đang có đơn dùng */}
            <Modal
                title={`Xoá loại phép "${deletingType?.name ?? ''}"?`}
                open={!!deletingType}
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
                            title={`Đang có ${deletingType?.inUseCount} đơn nghỉ phép dùng loại phép này`}
                            description="Chọn loại phép thay thế bên dưới - toàn bộ đơn nghỉ phép đang dùng loại này sẽ được tự động chuyển sang loại bạn chọn trước khi loại cũ bị xoá."
                        />
                        <Text strong>Chuyển sang loại phép:</Text>
                        <Select
                            style={{ width: '100%', marginTop: 8 }}
                            placeholder="Chọn loại phép thay thế"
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
                    <Text>Không có đơn nghỉ phép nào đang dùng loại phép này. Bạn có chắc muốn xoá?</Text>
                )}
            </Modal>
        </div>
    );
}