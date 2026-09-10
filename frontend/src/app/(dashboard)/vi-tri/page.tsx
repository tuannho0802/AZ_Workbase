'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Table,
    Button,
    Tag,
    Space,
    Modal,
    Form,
    Input,
    Select,
    App,
    Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDepartments } from '@/lib/hooks/useDepartments';
import {
    usePositions,
    useCreatePosition,
    useUpdatePosition,
    useDeletePosition,
} from '@/lib/hooks/usePositions';
import { Position } from '@/lib/api/positions.api';
import { PositionVisibilityDrawer } from './PositionVisibilityDrawer';

const { Title, Text } = Typography;

export default function PositionsPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();
    const { message } = App.useApp();
    const router = useRouter();

    useEffect(() => {
        if (!permissionsLoading && !can('positions.view')) {
            router.replace('/customers');
        }
    }, [router, permissionsLoading, can]);

    const canManage = can('positions.manage');
    const canDelete = can('positions.delete');
    // Cấu hình UI Visibility dùng chung quyền `roles.manage` (xem
    // ui-visibility.controller.ts) - KHÔNG phải `positions.manage`, vì đây
    // là cấu hình "phân quyền hiển thị", cùng nhóm với Ma trận quyền ở
    // /phan-quyen, không phải thao tác CRUD Vị trí thông thường.
    const canManageVisibility = can('roles.manage');

    const { positions, isLoading } = usePositions();
    const { departments, isLoading: loadingDepartments } = useDepartments();
    const createMutation = useCreatePosition();
    const updateMutation = useUpdatePosition();
    const deleteMutation = useDeletePosition();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [form] = Form.useForm();

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);

    const [visibilityPosition, setVisibilityPosition] = useState<Position | null>(null);

    const openCreateModal = () => {
        setEditingPosition(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEditModal = (position: Position) => {
        setEditingPosition(position);
        form.setFieldsValue({
            name: position.name,
            departmentId: position.departmentId,
            description: position.description,
        });
        setModalOpen(true);
    };

    const openDeleteModal = (position: Position) => {
        setDeletingPosition(position);
        setDeleteModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingPosition) {
                updateMutation.mutate(
                    { id: editingPosition.id, data: values },
                    {
                        onSuccess: () => {
                            message.success('Đã cập nhật vị trí');
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Cập nhật thất bại');
                        },
                    },
                );
            } else {
                createMutation.mutate(
                    {
                        code: values.code,
                        name: values.name,
                        departmentId: values.departmentId ?? null,
                        description: values.description,
                    },
                    {
                        onSuccess: () => {
                            message.success('Đã tạo vị trí mới');
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Tạo vị trí thất bại');
                        },
                    },
                );
            }
        } catch {
            // lỗi validate form - antd tự hiển thị
        }
    };

    const handleDelete = () => {
        if (!deletingPosition) return;
        deleteMutation.mutate(deletingPosition.id, {
            onSuccess: () => {
                message.success(`Đã xoá vị trí "${deletingPosition.name}"`);
                setDeleteModalOpen(false);
                setDeletingPosition(null);
            },
            onError: (err: any) => {
                message.error(err?.response?.data?.message || 'Xoá thất bại');
            },
        });
    };

    const canShowActionCol = canManage || canDelete || canManageVisibility;

    const columns = [
        {
            title: 'Mã vị trí',
            dataIndex: 'code',
            key: 'code',
            width: 140,
            render: (code: string) => <Text code>{code}</Text>,
        },
        {
            title: 'Tên vị trí',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Phòng ban (gợi ý)',
            key: 'department',
            render: (_: any, record: Position) =>
                record.department?.name ? (
                    <Tag color="blue">{record.department.name}</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            render: (v: string | null) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Loại',
            dataIndex: 'isSystem',
            key: 'isSystem',
            width: 120,
            render: (isSystem: boolean) =>
                isSystem ? <Tag color="gold">Hệ thống</Tag> : <Tag>Tuỳ chỉnh</Tag>,
        },
        ...(canShowActionCol
            ? [
                  {
                      title: 'Thao tác',
                      key: 'action',
                      width: 280,
                      render: (_: any, record: Position) => (
                          <Space wrap>
                              {canManageVisibility && (
                                  <Button
                                      size="small"
                                      icon={<EyeOutlined />}
                                      onClick={() => setVisibilityPosition(record)}
                                  >
                                      Hiển thị dữ liệu
                                  </Button>
                              )}
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
                        Quản lý Vị trí
                    </Title>
                    <Text type="secondary">
                        Vị trí (vd: Content, Editor, Media, HR, Director...) gắn thêm cho nhân viên bên
                        cạnh Role - dùng để override quyền chi tiết hơn và ẩn/hiện field, tab dữ liệu
                        Khách hàng riêng theo từng Vị trí.
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                        Thêm vị trí
                    </Button>
                )}
            </div>

            <Table
                rowKey="id"
                loading={isLoading}
                columns={columns}
                dataSource={positions}
                pagination={false}
            />

            {/* Modal Tạo / Sửa vị trí */}
            <Modal
                title={editingPosition ? `Sửa vị trí "${editingPosition.name}"` : 'Thêm vị trí mới'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
            >
                <Form form={form} layout="vertical">
                    {!editingPosition && (
                        <Form.Item
                            name="code"
                            label="Mã vị trí"
                            extra="Chỉ chữ thường, số và dấu gạch dưới (vd: content, hr, director). KHÔNG đổi được sau khi tạo."
                            rules={[
                                { required: true, message: 'Vui lòng nhập mã vị trí' },
                                {
                                    pattern: /^[a-z0-9_]+$/,
                                    message: 'Chỉ chữ thường, số và dấu gạch dưới',
                                },
                                { max: 50, message: 'Mã vị trí tối đa 50 ký tự' },
                            ]}
                        >
                            <Input placeholder="Ví dụ: content" />
                        </Form.Item>
                    )}
                    <Form.Item
                        name="name"
                        label="Tên vị trí"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên vị trí' },
                            { max: 100, message: 'Tên vị trí quá dài' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Content" />
                    </Form.Item>
                    <Form.Item
                        name="departmentId"
                        label="Phòng ban (gợi ý, không bắt buộc)"
                        extra="Chỉ để nhóm hiển thị trong danh sách - KHÔNG ràng buộc user phải thuộc đúng phòng ban này mới chọn được vị trí."
                    >
                        <Select
                            placeholder="Không thuộc phòng ban cụ thể"
                            allowClear
                            loading={loadingDepartments}
                            options={departments.map((d) => ({ value: d.id, label: d.name }))}
                            showSearch={{ optionFilterProp: 'label' }}
                        />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả (tuỳ chọn)">
                        <Input.TextArea rows={2} placeholder="Mô tả ngắn về vị trí" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Xoá vị trí */}
            <Modal
                title={`Xoá vị trí "${deletingPosition?.name}"`}
                open={deleteModalOpen}
                onCancel={() => {
                    setDeleteModalOpen(false);
                    setDeletingPosition(null);
                }}
                onOk={handleDelete}
                okText="Xoá"
                okButtonProps={{ danger: true }}
                confirmLoading={deleteMutation.isPending}
            >
                <Text>
                    Bạn có chắc muốn xoá vị trí này? Hệ thống sẽ từ chối nếu đang có nhân viên gán vị trí
                    này - vui lòng đổi/gỡ vị trí cho các nhân viên đó trước.
                </Text>
            </Modal>

            <PositionVisibilityDrawer
                position={visibilityPosition}
                open={!!visibilityPosition}
                onClose={() => setVisibilityPosition(null)}
            />
        </div>
    );
}
