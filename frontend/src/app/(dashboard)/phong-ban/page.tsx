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
    List,
    Avatar,
    Empty,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
    useDepartments,
    useCreateDepartment,
    useUpdateDepartment,
} from '@/lib/hooks/useDepartments';
import { useUsersList } from '@/lib/hooks/useUsers';
import { usersApi } from '@/lib/api/users.api';
import { Department } from '@/lib/api/departments.api';

const { Title, Text } = Typography;

interface DeptUserPreview {
    id: number;
    name: string;
    email: string;
}

export default function DepartmentsPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();
    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);

    // Khớp @RequirePermission('departments.view') ở departments.controller.ts
    // (GET /departments) - cùng pattern chặn UI đã dùng ở nguon-media,
    // nhom-lien-ket... (chặn thật sự luôn nằm ở BE, đây chỉ để UX gọn).
    useEffect(() => {
        if (!permissionsLoading && user && !can('departments.view')) {
            router.replace('/customers');
        }
    }, [user, router, permissionsLoading, can]);

    // ⚠️ Cả tạo mới (POST) LẪN sửa (PATCH, bao gồm gán Manager) đều dùng
    // CHUNG 1 permission 'departments.manage' ở BE hiện tại (chưa tách
    // create/edit riêng như 1 số module khác) - xem departments.controller.ts.
    const canManage = can('departments.manage');
    // Nút "Xem" (Drawer danh sách nhân viên) gọi GET /users?departmentId=X -
    // endpoint này yêu cầu 'users.view' (users.controller.ts), KHÔNG phải
    // 'departments.manage' - phải check ĐÚNG permission của endpoint sẽ gọi,
    // tránh hiện nút rồi bấm vào dính 403 (rà soát permission UI).
    const canViewUsers = can('users.view');

    const { departments, isLoading } = useDepartments();
    const createMutation = useCreateDepartment();
    const updateMutation = useUpdateDepartment();

    // Danh sách TẤT CẢ user (không lọc role) - chỉ dùng để tra cứu tên hiển
    // thị đúng cho managerUserId đang lưu trên từng phòng ban, kể cả trường
    // hợp hiếm user đó sau này bị đổi role khỏi Manager (không muốn cột
    // "Quản lý" hiện trống/ID thô khó hiểu).
    const { users: allUsers } = useUsersList();
    const userNameById = useMemo(
        () => new Map((allUsers || []).map((u: any) => [u.id, u.name])),
        [allUsers],
    );

    // Danh sách ứng viên CHO DROPDOWN gán Manager - chỉ user có role Manager,
    // khớp đúng validate ở BE (`managerCandidate.role !== Role.MANAGER` ->
    // BadRequestException) - lọc trước ở FE để tránh chọn xong mới báo lỗi.
    const { users: managerCandidates } = useUsersList('manager');
    const managerOptions = (managerCandidates || []).map((u: any) => ({
        value: u.id,
        label: u.isActive ? u.name : `${u.name} (đã khoá)`,
        disabled: !u.isActive,
    }));

    const [modalOpen, setModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [form] = Form.useForm();

    // Drawer "Danh sách nhân viên phòng ban" - fetch riêng khi mở (không
    // nhúng sẵn dữ liệu đầy đủ cho MỌI phòng ban vào bảng chính).
    const [viewingDept, setViewingDept] = useState<Department | null>(null);
    const { data: deptUsersData, isFetching: deptUsersLoading } = useQuery({
        queryKey: ['department-users', viewingDept?.id],
        queryFn: () => usersApi.getUsers({ departmentId: viewingDept!.id, limit: 100 }),
        enabled: !!viewingDept && canViewUsers,
    });
    const deptUsersList: DeptUserPreview[] = Array.isArray(deptUsersData)
        ? deptUsersData
        : deptUsersData?.data ?? [];

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
            managerUserId: dept.managerUserId ?? undefined,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingDept) {
                updateMutation.mutate(
                    { id: editingDept.id, data: values },
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
                // Tạo mới KHÔNG nhận isActive/managerUserId (xem CreateDepartmentDto
                // ở BE - chỉ name/description) - loại 2 field đó ra trước khi gửi,
                // dù form không hiện chúng lúc tạo mới nên values vốn đã không có.
                createMutation.mutate(
                    { name: values.name, description: values.description },
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
            // lỗi validate form - antd tự hiển thị, không cần xử lý thêm
        }
    };

    const columns = [
        {
            title: 'Tên phòng ban',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            render: (v: string | undefined) => v || <Text type="secondary">—</Text>,
        },
        {
            title: 'Quản lý (Manager)',
            dataIndex: 'managerUserId',
            key: 'managerUserId',
            render: (managerUserId: number | null | undefined) =>
                managerUserId ? (
                    userNameById.get(managerUserId) || `#${managerUserId}`
                ) : (
                    <Text type="secondary">Chưa gán</Text>
                ),
        },
        {
            title: 'Nhân viên',
            key: 'employees',
            width: 200,
            render: (_: any, record: Department) => {
                const list = record.employees ?? [];
                if (list.length === 0) return <Text type="secondary">Chưa có ai</Text>;
                const rest = list.length - 1;
                return (
                    <span>
                        {list[0].name}
                        {rest > 0 && (
                            <Tag style={{ marginLeft: 6 }} color="blue">
                                +{rest}
                            </Tag>
                        )}
                    </span>
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
        {
            title: 'Thao tác',
            key: 'action',
            width: 160,
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
                </Space>
            ),
        },
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

                    {/* Chỉ hiện khi SỬA - tạo mới không nhận 2 field này (xem
              CreateDepartmentDto ở BE chỉ có name/description). */}
                    {editingDept && (
                        <>
                            <Form.Item
                                name="managerUserId"
                                label="Quản lý (Manager)"
                                extra="Chỉ chọn được user có vai trò Manager và đang hoạt động."
                            >
                                <Select
                                    allowClear
                                    showSearch={{
                                        optionFilterProp: "label"
                                    }}
                                    placeholder="Chưa gán Manager"
                                    options={managerOptions}
                                />
                            </Form.Item>
                            <Form.Item name="isActive" label="Trạng thái hoạt động" valuePropName="checked">
                                <Switch checkedChildren="Đang hoạt động" unCheckedChildren="Ngừng hoạt động" />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>

            <Drawer
                title={`Nhân viên phòng "${viewingDept?.name}"`}
                open={!!viewingDept}
                onClose={() => setViewingDept(null)}
                size={400}
            >
                <List
                    loading={deptUsersLoading}
                    dataSource={deptUsersList}
                    locale={{ emptyText: <Empty description="Phòng ban này chưa có nhân viên nào" /> }}
                    renderItem={(u: DeptUserPreview) => (
                        <List.Item>
                            <List.Item.Meta
                                avatar={<Avatar icon={<UserOutlined />} />}
                                title={u.name}
                                description={u.email}
                            />
                            {u.id === viewingDept?.managerUserId && <Tag color="gold">Manager</Tag>}
                        </List.Item>
                    )}
                />
            </Drawer>
        </div>
    );
}