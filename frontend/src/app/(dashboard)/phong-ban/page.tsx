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
    Select,
    Switch,
    App,
    Typography,
    Drawer,
    Avatar,
    Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, UserOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
    useDepartments,
    useCreateDepartment,
    useUpdateDepartment,
    useDeleteDepartment,
} from '@/lib/hooks/useDepartments';
import { useUsersList } from '@/lib/hooks/useUsers';
import { usersApi } from '@/lib/api/users.api';
import { Department } from '@/lib/api/departments.api';
import { SimpleList } from '@/components/common/SimpleList';
import { ColorPickerField } from '@/components/common/ColorPickerField';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Title, Text } = Typography;

interface DeptUserPreview {
    id: number;
    name: string;
    email: string;
    // ⚠️ Bắt buộc có field này - Tag "Manager" trong Drawer phải dựa vào
    // ĐÚNG role thật của từng user (u.role === 'manager'), KHÔNG dựa vào so
    // sánh với `department.managers` (danh sách nhiều-nhiều NHỮNG NGƯỜI
    // ĐƯỢC GÁN quản lý phòng ban này qua bảng department_managers - phòng
    // ban có thể có NHIỀU user khác cũng mang role Manager mà chưa/không
    // phải người được gán quản lý chính thức). Bug cũ (trước khi có bảng
    // department_managers): chỉ đúng 1 người có Tag dù phòng ban có 2
    // Manager thật.
    role: string;
}

export default function DepartmentsPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();
    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);

    useEffect(() => {
        if (!permissionsLoading && user && !can('departments.view')) {
            router.replace('/customers');
        }
    }, [user, router, permissionsLoading, can]);

    const canManage = can('departments.manage');
    const canDelete = can('departments.delete');
    const canViewUsers = can('users.view');

    const { departments, isLoading } = useDepartments();
    const createMutation = useCreateDepartment();
    const updateMutation = useUpdateDepartment();
    const deleteMutation = useDeleteDepartment();

    // Lấy TOÀN BỘ user active (không lọc role='manager' tại BE nữa) vì BE
    // (departments.service.ts) giờ cho phép gán NHIỀU Manager/phòng ban
    // (bảng department_managers) cho user có role Admin/Assistant/Manager -
    // lọc client-side theo đúng 3 role này để đổ vào dropdown chọn multi
    // "Quản lý phòng ban".
    const { users: allActiveUsers } = useUsersList();
    const managerCandidates = useMemo(
        () => (allActiveUsers || []).filter((u: any) => ['admin', 'assistant', 'manager'].includes(u.role)),
        [allActiveUsers],
    );
    const managerCandidateOptions = useMemo(
        () => managerCandidates.map((u: any) => ({ value: u.id, label: `${u.name} (${u.role})` })),
        [managerCandidates],
    );

    const [modalOpen, setModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [form] = Form.useForm();

    const [viewingDept, setViewingDept] = useState<Department | null>(null);
    const { data: deptUsersData, isFetching: deptUsersLoading } = useQuery({
        queryKey: ['department-users', viewingDept?.id],
        queryFn: () => usersApi.getUsers({ departmentId: viewingDept!.id, limit: 100 }),
        enabled: !!viewingDept && canViewUsers,
    });
    const deptUsersList: DeptUserPreview[] = Array.isArray(deptUsersData)
        ? deptUsersData
        : deptUsersData?.data ?? [];

    // --- Delete modal ---
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletingDept, setDeletingDept] = useState<Department | null>(null);
    const [deleteForm] = Form.useForm();

    const openCreateModal = () => {
        setEditingDept(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEditModal = (dept: Department) => {
        setEditingDept(dept);
        form.setFieldsValue({
            name: dept.name,
            description: dept.description,
            isActive: dept.isActive,
            color: resolveEntityColor(dept.color),
            // Nhiều Manager (nhiều-nhiều) - nguồn đúng là dept.managers[] trả về
            // từ GET /departments, KHÔNG còn dùng dept.managerUserId (đã deprecated).
            managerUserIds: (dept.managers ?? []).map((m) => m.id),
        });
        setModalOpen(true);
    };

    const openDeleteModal = (dept: Department) => {
        setDeletingDept(dept);
        deleteForm.resetFields();
        setDeleteModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingDept) {
                // managerUserIds luôn gửi lại TOÀN BỘ danh sách đang chọn trong
                // Select mode="multiple" (thay thế, không phải thêm/bớt - khớp
                // đúng hợp đồng update-department.dto.ts ở BE). Không chọn gì =
                // mảng rỗng [] (gỡ hết Manager), khác với undefined (không đụng gì).
                updateMutation.mutate(
                    { id: editingDept.id, data: { ...values, managerUserIds: values.managerUserIds ?? [] } },
                    {
                        onSuccess: () => {
                            message.success('Đã cập nhật phòng ban');
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Cập nhật thất bại');
                        },
                    },
                );
            } else {
                createMutation.mutate(
                    { name: values.name, description: values.description, color: values.color },
                    {
                        onSuccess: () => {
                            message.success('Đã tạo phòng ban mới');
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Tạo phòng ban thất bại');
                        },
                    },
                );
            }
        } catch {
            // lỗi validate form - antd tự hiển thị
        }
    };

    const handleDelete = async () => {
        if (!deletingDept) return;
        try {
            const values = await deleteForm.validateFields();
            deleteMutation.mutate(
                {
                    id: deletingDept.id,
                    data: values.moveUsersToDepartmentId
                        ? { moveUsersToDepartmentId: values.moveUsersToDepartmentId }
                        : undefined,
                },
                {
                    onSuccess: (res) => {
                        message.success(
                            `Đã xoá phòng ban "${deletingDept.name}"` +
                            (res.movedUsersCount > 0
                                ? ` — đã di dời ${res.movedUsersCount} nhân viên`
                                : ''),
                        );
                        setDeleteModalOpen(false);
                        setDeletingDept(null);
                    },
                    onError: (err: any) => {
                        message.error(err?.response?.data?.message || 'Xoá thất bại');
                    },
                },
            );
        } catch {
    // validate error
        }
    };

    const deletingDeptEmployeeCount = deletingDept?.employees?.length ?? 0;
    const otherDepartmentOptions = departments
        .filter((d) => d.id !== deletingDept?.id && d.isActive)
        .map((d) => ({ value: d.id, label: d.name }));

    const canShowActionCol = canViewUsers || canManage || canDelete;

    const columns = [
        {
            title: 'Tên phòng ban',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: Department) => (
                <Tag color={resolveEntityColor(record.color)}>{name}</Tag>
            ),
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            render: (v: string | undefined) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Quản lý (Manager)',
            key: 'managers',
            render: (_: any, record: Department) => {
                const managers = record.managers ?? [];
                if (managers.length === 0) return <Text type="secondary">Chưa gán</Text>;
                return (
                    <Space size={[4, 4]} wrap>
                        {managers.map((m) => (
                            <span key={m.id}>
                                {m.name}
                                <Tag style={{ marginLeft: 4 }} color="blue">
                                    {m.role}
                                </Tag>
                            </span>
                        ))}
                    </Space>
                );
            },
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 140,
            render: (isActive: boolean) =>
                isActive ? <Tag color="green">Đang hoạt động</Tag> : <Tag color="red">Ngừng hoạt động</Tag>,
        },
        ...(canShowActionCol ? [{
            title: 'Thao tác',
            key: 'action',
            width: 220,
            render: (_: any, record: Department) => (
                <Space>
                    {canViewUsers && (
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewingDept(record)}>
                            Xem
                        </Button>
                    )}
                    {canManage && (
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                            Sửa
                        </Button>
                    )}
                    {/* Nút Xoá chỉ hiện nếu còn >= 2 phòng ban (BE cũng enforce điều này) */}
                    {canDelete && departments.length > 1 && (
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
        }] : []),
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
                        Quản lý phòng ban
                    </Title>
                    <Text type="secondary">
                        Gán "Quản lý" (Manager) cho từng phòng ban để xác định phạm vi xem/thao tác dữ
                        liệu theo phòng ban ở các module khác (Khách hàng, Chấm công, Nghỉ phép...).
                    </Text>
                </div>
                {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                        Thêm phòng ban
                    </Button>
                )}
            </div>

            <Table rowKey="id" loading={isLoading} columns={columns} dataSource={departments} pagination={false} />

            {/* Modal Tạo / Sửa phòng ban */}
            <Modal
                title={editingDept ? `Sửa phòng ban "${editingDept.name}"` : 'Thêm phòng ban mới'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Tên phòng ban"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên phòng ban' },
                            { max: 100, message: 'Tên phòng ban quá dài' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Phòng Marketing" />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả (tuỳ chọn)">
                        <Input.TextArea rows={2} placeholder="Mô tả ngắn về phòng ban" />
                    </Form.Item>
                    <ColorPickerField extra="Màu Tag phòng ban này hiển thị ở bảng danh sách và các nơi liên quan (Vị trí, chi tiết khách hàng, chọn Sales/Marketing phụ trách...)." />

                    {editingDept && (
                        <>
                            <Form.Item
                                name="managerUserIds"
                                label="Quản lý phòng ban (Manager)"
                                extra="Những người được gán ở đây quyết định phạm vi 'Phòng ban quản lý' (department scope) trong Ma trận quyền cho CHÍNH họ - áp dụng cho Admin/Assistant/Manager. Có thể chọn NHIỀU người cùng quản lý 1 phòng ban. Để trống nếu phòng ban tạm chưa có ai quản lý."
                            >
                                <Select
                                    mode="multiple"
                                    allowClear
                                    showSearch
                                    placeholder="Chọn (nhiều) user quản lý phòng ban này"
                                    options={managerCandidateOptions}
                                    optionFilterProp="label"
                                />
                            </Form.Item>
                            <Form.Item name="isActive" label="Trạng thái hoạt động" valuePropName="checked">
                                <Switch checkedChildren="Đang hoạt động" unCheckedChildren="Ngừng hoạt động" />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>

            {/* Modal Xoá phòng ban — nhắc di dời nhân viên nếu còn */}
            <Modal
                title={`Xoá phòng ban "${deletingDept?.name}"`}
                open={deleteModalOpen}
                onCancel={() => { setDeleteModalOpen(false); setDeletingDept(null); }}
                onOk={handleDelete}
                okText="Xoá"
                okButtonProps={{ danger: true }}
                confirmLoading={deleteMutation.isPending}
            >
                {/* Form luôn được mount để deleteForm instance luôn có element kết nối —
                    tránh warning "useForm not connected to any Form element" khi phòng ban
                    không có nhân viên (lúc đó branch ternary kia không render Form). */}
                <Form form={deleteForm} layout="vertical">
                    {deletingDeptEmployeeCount > 0 ? (
                        <>
                            <Text>
                                Phòng ban này đang có <Text strong>{deletingDeptEmployeeCount}</Text> nhân viên.
                                Vui lòng chọn phòng ban khác để di dời họ sang trước khi xoá.
                            </Text>
                            <Form.Item
                                name="moveUsersToDepartmentId"
                                label="Di dời nhân viên sang phòng ban"
                                rules={[{ required: true, message: 'Vui lòng chọn phòng ban đích' }]}
                                style={{ marginTop: 16 }}
                            >
                                <Select
                                    placeholder="Chọn phòng ban đích"
                                    options={otherDepartmentOptions}
                                    showSearch={{ optionFilterProp: 'label' }}
                                />
                            </Form.Item>
                        </>
                    ) : (
                        <Text>
                            Phòng ban này không còn nhân viên. Bạn có chắc muốn xoá?
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Lưu ý: Dữ liệu khách hàng liên kết phòng ban này sẽ không còn phòng ban (có thể gán lại sau).
                            </Text>
                        </Text>
                    )}
                </Form>
            </Modal>

            <Drawer
                title={`Nhân viên phòng "${viewingDept?.name}"`}
                open={!!viewingDept}
                onClose={() => setViewingDept(null)}
                size={400}
            >
                <SimpleList<DeptUserPreview>
                    loading={deptUsersLoading}
                    dataSource={deptUsersList}
                    rowKey={(u) => u.id}
                    emptyText="Phòng ban này chưa có nhân viên nào"
                    onItemClick={(u) => router.push(`/profile?userId=${u.id}`)}
                    renderMeta={(u) => ({
                        avatar: <Avatar icon={<UserOutlined />} />,
                        title: u.name,
                        description: u.email,
                    })}
                    renderActions={(u) =>
                        u.role === 'manager' ? [<Tag key="manager-tag" color="gold">Manager</Tag>] : []
                    }
                />
            </Drawer>
        </div>
    );
}