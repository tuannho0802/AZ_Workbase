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
    Switch,
    Tooltip,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LockOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import {
    usePeriodicTaskStatuses,
    useCreatePeriodicTaskStatus,
    useUpdatePeriodicTaskStatus,
    useDeletePeriodicTaskStatus,
} from '@/lib/hooks/usePeriodicTaskStatuses';
import { PeriodicTaskStatus } from '@/lib/api/periodic-task-statuses.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { ListFilterBar } from '@/components/common/ListFilterBar';

const { Title, Text } = Typography;

/**
 * Trang quản trị "Trạng thái Công việc định kỳ" - mirror ĐÚNG cấu trúc
 * `quan-ly-status-khach/page.tsx` (CustomerStatusesPage). Khác 2 điểm do BE
 * khác nhau (xem `periodic-task-statuses.service.ts`):
 *  1. `fallbackStatusId` truyền khi xoá là ID (number), không phải code.
 *  2. Có thêm 2 field `isDoneState`/`isExcludedFromRollup` phục vụ % rollup
 *     ở Phase 2 - cấu hình sẵn từ Phase 1 để không phải sửa lại dữ liệu.
 */
export default function PeriodicTaskStatusesPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();

    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);

    // Khớp @RequirePermission('periodic_task_statuses.manage'/'.delete') ở
    // periodic-task-statuses.controller.ts. GET /periodic-task-statuses
    // KHÔNG bị BE chặn theo permission (mọi user đăng nhập gọi được để load
    // dropdown), permission `.view` ở đây CHỈ dùng để FE gate TRANG QUẢN LÝ
    // này (mirror đúng comment trong Controller).
    useEffect(() => {
        if (!permissionsLoading && user && !can('periodic_task_statuses.view')) {
            router.replace('/cong-viec-dinh-ky');
        }
    }, [user, router]);

    const canManage = can('periodic_task_statuses.manage');
    const canDelete = can('periodic_task_statuses.delete');

    const { statuses, isLoading } = usePeriodicTaskStatuses();
    const createMutation = useCreatePeriodicTaskStatus();
    const updateMutation = useUpdatePeriodicTaskStatus();
    const deleteMutation = useDeletePeriodicTaskStatus();

    // Filter nhẹ CLIENT-SIDE (danh mục trạng thái luôn rất ít, hook trả toàn
    // bộ không phân trang - mirror quan-ly-status-khach).
    const [searchText, setSearchText] = useState('');
    const [filterIsSystem, setFilterIsSystem] = useState<boolean | undefined>(undefined);
    const filteredStatuses = useMemo(() => {
        return statuses.filter((s) => {
            if (filterIsSystem !== undefined && s.isSystem !== filterIsSystem) return false;
            if (searchText.trim()) {
                const q = searchText.trim().toLowerCase();
                if (!(s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }, [statuses, searchText, filterIsSystem]);

    // ---- Modal Thêm/Sửa ----
    const [modalOpen, setModalOpen] = useState(false);
    const [editingStatus, setEditingStatus] = useState<PeriodicTaskStatus | null>(null);
    const [form] = Form.useForm();

    const openCreateModal = () => {
        setEditingStatus(null);
        form.resetFields();
        form.setFieldsValue({ color: '#1890ff', sortOrder: 0, isDoneState: false, isExcludedFromRollup: false });
        setModalOpen(true);
    };

    const openEditModal = (status: PeriodicTaskStatus) => {
        setEditingStatus(status);
        form.setFieldsValue({
            code: status.code,
            name: status.name,
            description: status.description ?? undefined,
            color: status.color,
            sortOrder: status.sortOrder,
            isDoneState: status.isDoneState,
            isExcludedFromRollup: status.isExcludedFromRollup,
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

    // ---- Modal Xoá (kèm chọn fallback nếu đang có Task dùng) ----
    const [deletingStatus, setDeletingStatus] = useState<PeriodicTaskStatus | null>(null);
    const [fallbackStatusId, setFallbackStatusId] = useState<number | null>(null);

    const openDeleteModal = (status: PeriodicTaskStatus) => {
        setDeletingStatus(status);
        setFallbackStatusId(null);
    };

    const closeDeleteModal = () => {
        setDeletingStatus(null);
        setFallbackStatusId(null);
    };

    // Danh sách chọn fallback: mọi trạng thái KHÁC trạng thái đang xoá (kể cả
    // trạng thái hệ thống - hợp lệ để fallback VỀ status hệ thống, chỉ không
    // được XOÁ status hệ thống - xem BE `remove()`).
    const fallbackOptions = useMemo(
        () =>
            statuses
                .filter((s) => s.id !== deletingStatus?.id)
                .map((s) => ({ value: s.id, label: s.name, color: s.color })),
        [statuses, deletingStatus],
    );

    const needsFallback = (deletingStatus?.inUseCount ?? 0) > 0;

    const handleConfirmDelete = () => {
        if (!deletingStatus) return;
        if (needsFallback && !fallbackStatusId) {
            message.warning('Vui lòng chọn trạng thái thay thế trước khi xoá');
            return;
        }
        deleteMutation.mutate(
            { id: deletingStatus.id, fallbackStatusId: fallbackStatusId ?? undefined },
            {
                onSuccess: (res) => {
                    message.success(
                        res.reassignedCount > 0
                            ? `Đã xoá "${deletingStatus.name}" và chuyển ${res.reassignedCount} Công việc định kỳ sang trạng thái thay thế`
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
            render: (name: string, record: PeriodicTaskStatus) => (
                <Space>
                    <Tag color={record.color} style={{ marginRight: 0 }}>
                        {name}
                    </Tag>
                    {record.isSystem && (
                        <Tooltip title="Trạng thái hệ thống - không xoá được, chỉ sửa tên/màu/mô tả">
                            <LockOutlined style={{ color: '#faad14' }} />
                        </Tooltip>
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
            render: (desc?: string) => desc || <Text type="secondary">-</Text>,
        },
        {
            title: (
                <Space size={4}>
                    Tính % hoàn thành
                    <Tooltip title="Task ở trạng thái này có tính vào TỬ SỐ % rollup không (dùng ở Phase 2 - Rollup theo phòng ban/kỳ)">
                        <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                    </Tooltip>
                </Space>
            ),
            dataIndex: 'isDoneState',
            key: 'isDoneState',
            width: 150,
            render: (v: boolean) => (v ? <Tag color="success">Hoàn thành</Tag> : <Tag>Chưa tính</Tag>),
        },
        {
            title: 'Đang dùng',
            dataIndex: 'inUseCount',
            key: 'inUseCount',
            width: 100,
            render: (count: number) => (count > 0 ? <Tag color="blue">{count} Task</Tag> : <Text type="secondary">0</Text>),
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
                    render: (_: any, record: PeriodicTaskStatus) => (
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
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        Quản lý Trạng thái Công việc định kỳ
                    </Title>
                    <Text type="secondary">
                        Danh sách trạng thái hiển thị trong dropdown "Trạng thái" khi thêm/sửa Công việc định kỳ. 3
                        trạng thái hệ thống mặc định (Chưa hoàn thành/Hoàn thành/Không hoàn thành) chỉ sửa được tên/
                        màu/mô tả, không xoá được. Trạng thái tuỳ chỉnh có thể xoá, nhưng nếu đang có Task dùng sẽ
                        cần chọn trạng thái thay thế để chuyển dữ liệu trước khi xoá.
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                        Thêm trạng thái mới
                    </Button>
                )}
            </div>

            <ListFilterBar
                searchValue={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder="Tìm theo tên hoặc mã trạng thái..."
                dropdowns={[
                    {
                        key: 'isSystem',
                        placeholder: 'Loại',
                        value: filterIsSystem,
                        onChange: setFilterIsSystem,
                        options: [
                            { value: true, label: <Tag color="gold" style={{ marginInlineEnd: 0 }}>Hệ thống</Tag> },
                            { value: false, label: <Tag style={{ marginInlineEnd: 0 }}>Tuỳ chỉnh</Tag> },
                        ],
                    },
                ]}
            />

            <Table
                rowKey="id"
                loading={isLoading}
                columns={columns}
                dataSource={filteredStatuses}
                pagination={false}
                scroll={{ x: 'max-content' }}
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
                        message="Đây là trạng thái hệ thống - chỉ sửa được tên/màu/mô tả/thứ tự/cấu hình rollup, mã (code) giữ nguyên."
                    />
                )}
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="code"
                        label="Mã trạng thái (code)"
                        tooltip="Giá trị THẬT lưu vào dữ liệu Công việc định kỳ - không đổi được sau khi tạo"
                        rules={[
                            { required: true, message: 'Vui lòng nhập mã trạng thái' },
                            {
                                pattern: /^[a-z0-9_]+$/,
                                message: 'Chỉ chữ thường, số và dấu gạch dưới (vd: in_review)',
                            },
                            { max: 50, message: 'Mã trạng thái tối đa 50 ký tự' },
                        ]}
                    >
                        <Input placeholder="vd: in_review" disabled={!!editingStatus} />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Tên hiển thị"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên trạng thái' },
                            { max: 100, message: 'Tên trạng thái tối đa 100 ký tự' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Đang xem xét" />
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
                    <Form.Item
                        name="isDoneState"
                        label="Tính là Hoàn thành (cho % rollup)"
                        valuePropName="checked"
                        tooltip="Bật nếu Task ở trạng thái này được tính là ĐÃ XONG khi tính % hoàn thành theo phòng ban/kỳ (Phase 2)"
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        name="isExcludedFromRollup"
                        label="Loại khỏi % rollup"
                        valuePropName="checked"
                        tooltip="Bật nếu Task ở trạng thái này KHÔNG được tính vào cả tử số lẫn mẫu số % rollup (vd trạng thái 'Đã huỷ')"
                    >
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Xoá - kèm chọn fallback nếu đang có Task dùng */}
            <Modal
                title={`Xoá trạng thái "${deletingStatus?.name ?? ''}"?`}
                open={!!deletingStatus}
                onCancel={closeDeleteModal}
                onOk={handleConfirmDelete}
                okButtonProps={{ danger: true, disabled: needsFallback && !fallbackStatusId }}
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
                            message={`Đang có ${deletingStatus?.inUseCount} Công việc định kỳ dùng trạng thái này`}
                            description="Chọn trạng thái thay thế bên dưới - toàn bộ Task đang dùng trạng thái này sẽ được tự động chuyển sang trạng thái bạn chọn trước khi trạng thái cũ bị xoá."
                        />
                        <Text strong>Chuyển sang trạng thái:</Text>
                        <Select
                            style={{ width: '100%', marginTop: 8 }}
                            placeholder="Chọn trạng thái thay thế"
                            value={fallbackStatusId ?? undefined}
                            onChange={(value) => setFallbackStatusId(value)}
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
                    <Text>Không có Công việc định kỳ nào đang dùng trạng thái này. Bạn có chắc muốn xoá?</Text>
                )}
            </Modal>
        </div>
    );
}