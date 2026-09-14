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
    DatePicker,
    App,
    Typography,
    Tooltip,
    Row,
    Col,
    ColorPicker,
    Alert,
    Avatar,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SearchOutlined,
    SettingOutlined,
    ApartmentOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { useUsersList } from '@/lib/hooks/useUsers';
import { usePeriodicTaskStatuses } from '@/lib/hooks/usePeriodicTaskStatuses';
import {
    usePeriodicTasks,
    useCreatePeriodicTask,
    useUpdatePeriodicTask,
    useDeletePeriodicTask,
} from '@/lib/hooks/usePeriodicTasks';
import {
    PeriodicTask,
    PeriodType,
    PERIOD_TYPE_LABELS,
    CreatePeriodicTaskPayload,
} from '@/lib/api/periodic-tasks.api';
import { resolveEntityColor, DEFAULT_ENTITY_COLOR } from '@/lib/utils/entityColor';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { TaskLinksModal } from '@/components/periodic-tasks/TaskLinksModal';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

/**
 * Trang chính "Công việc định kỳ" (Phase 1 + Phase 2 -
 * PLAN_PERIODIC_TASKS_MODULE.md mục 6). Phase 2 (liên kết cha-con DAG +
 * % hoàn thành) được UI qua nút "Liên kết" mở `TaskLinksModal` - xem file đó.
 * CHƯA có ở Phase 2 (để Phase 3-5): gắn Customer, phụ trách phụ,
 * lock/unlock/duyệt - KHÔNG dựng UI cho các phần này ở đây.
 *
 * RBAC: mọi filter/scope (own/department/all) đã được BE tự áp qua
 * `PeriodicTaskAccessHelper` (xem `periodic-tasks.service.ts`) - FE chỉ việc
 * gọi `/periodic-tasks` bình thường, KHÔNG tự lọc lại theo user.
 */
export default function PeriodicTasksPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const { can, isLoading: permissionsLoading } = useMyPermissions();

    useEffect(() => {
        if (!permissionsLoading && user && !can('periodic_tasks.view')) {
            router.replace('/customers');
        }
    }, [user, router]);

    const canCreate = can('periodic_tasks.create');
    const canEdit = can('periodic_tasks.edit');
    // Xoá KHÔNG có scope - chỉ Admin mới có permission này (seed
    // `1782100000000-SeedPeriodicTasksPermissions.ts`: delete chỉ role
    // admin, scope 'all'), khác hẳn view/create/edit có 3 mức own/department/all.
    const canDelete = can('periodic_tasks.delete');
    const canManageStatuses = can('periodic_task_statuses.view');

    // ---- Filter (server-side, mirror CustomerFilters) ----
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const search = useDebounce(searchInput, 300);
    const [periodType, setPeriodType] = useState<PeriodType | undefined>(undefined);
    const [statusId, setStatusId] = useState<number | undefined>(undefined);
    const [primaryAssigneeId, setPrimaryAssigneeId] = useState<number | undefined>(undefined);
    const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

    const filters = useMemo(
        () => ({
            page,
            limit,
            search: search || undefined,
            periodType,
            statusId,
            primaryAssigneeId,
            departmentId,
            dateFrom: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
            dateTo: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
        }),
        [page, limit, search, periodType, statusId, primaryAssigneeId, departmentId, dateRange],
    );

    const { data, isLoading, isFetching } = usePeriodicTasks(filters);
    const tasks = data?.data ?? [];

    const { statuses } = usePeriodicTaskStatuses();
    const { departments } = useDepartments();
    const { users } = useUsersList();

    // Avatar + Tag Vai trò/Phòng ban cho dropdown "Người phụ trách chính" -
    // mirror ĐÚNG `renderUserOption` ở CustomerFilters.tsx/chia-data/page.tsx
    // (cùng nguồn useUsersList() đã JOIN department/position, chỉ thiếu Tag
    // màu nên trước đây hiện tên trơn, không đồng bộ với các dropdown khác).
    const { getRoleColor } = useRoleColorMap();
    const { roleColors: allRoles } = useRoleColors();
    const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
    const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');
    const tagStyle: { fontSize: number; lineHeight: string; padding: string; margin: number } = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    const renderUserOption = (option: { data: { user: any } }) => {
        const u = option.data.user;
        return (
            <Space size={4} align="center">
                <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
                    {u.name?.[0]?.toUpperCase()}
                </Avatar>
                <span style={{ fontSize: 13 }}>{u.name}</span>
                {u.role && (
                    <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
                )}
                {u.department?.name && (
                    <Tag style={tagStyle} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
                )}
                {u.position?.name && (
                    <Tag style={tagStyle} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
                )}
            </Space>
        );
    };

    const createMutation = useCreatePeriodicTask();
    const updateMutation = useUpdatePeriodicTask();
    const deleteMutation = useDeletePeriodicTask();

    // Reset về trang 1 khi đổi filter (trừ chính page) để tránh trang trống.
    useEffect(() => {
        setPage(1);
    }, [search, periodType, statusId, primaryAssigneeId, departmentId, dateRange]);

    // ---- Modal Thêm/Sửa ----
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<PeriodicTask | null>(null);
    const [form] = Form.useForm();

    const openCreateModal = () => {
        setEditingTask(null);
        form.resetFields();
        form.setFieldsValue({ periodType: 'daily', color: '#1890ff' });
        setModalOpen(true);
    };

    const openEditModal = (task: PeriodicTask) => {
        setEditingTask(task);
        form.setFieldsValue({
            title: task.title,
            description: task.description ?? undefined,
            periodType: task.periodType,
            periodRange: [dayjs(task.periodStartDate), dayjs(task.periodEndDate)],
            statusId: task.statusId,
            primaryAssigneeId: task.primaryAssigneeId,
            departmentId: task.departmentId ?? undefined,
            note: task.note ?? undefined,
            color: task.color ?? '#1890ff',
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const { periodRange, ...rest } = values;
            const payload: CreatePeriodicTaskPayload = {
                ...rest,
                periodStartDate: periodRange[0].format('YYYY-MM-DD'),
                periodEndDate: periodRange[1].format('YYYY-MM-DD'),
            };

            if (editingTask) {
                updateMutation.mutate(
                    { id: editingTask.id, data: payload },
                    {
                        onSuccess: () => {
                            message.success('Đã cập nhật Công việc định kỳ');
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Cập nhật thất bại');
                        },
                    },
                );
            } else {
                createMutation.mutate(payload, {
                    onSuccess: () => {
                        message.success('Đã tạo Công việc định kỳ mới');
                        setModalOpen(false);
                    },
                    onError: (err: any) => {
                        message.error(err?.response?.data?.message || 'Tạo thất bại');
                    },
                });
            }
        } catch {
            // lỗi validate form - antd tự hiển thị
        }
    };

    // ---- Modal Liên kết & Tiến độ (Phase 2) ----
    const [linkingTask, setLinkingTask] = useState<PeriodicTask | null>(null);

    // ---- Modal Xoá (đơn giản - CHỈ Admin, không scope/fallback) ----
    const [deletingTask, setDeletingTask] = useState<PeriodicTask | null>(null);

    const handleConfirmDelete = () => {
        if (!deletingTask) return;
        deleteMutation.mutate(deletingTask.id, {
            onSuccess: () => {
                message.success(`Đã xoá "${deletingTask.title}"`);
                setDeletingTask(null);
            },
            onError: (err: any) => {
                message.error(err?.response?.data?.message || 'Xoá thất bại');
                setDeletingTask(null);
            },
        });
    };

    const columns = [
        {
            title: 'Công việc',
            dataIndex: 'title',
            key: 'title',
            width: 260,
            render: (title: string, record: PeriodicTask) => (
                <Space align="start">
                    {/* Chấm màu Task - CHỈ hiển thị UI, không mang ý nghĩa nghiệp vụ
                        (xem JSDoc entity BE). Fallback màu mặc định nếu chưa set. */}
                    <Tooltip title={record.color ? `Màu: ${record.color}` : 'Chưa đặt màu'}>
                        <span
                            style={{
                                display: 'inline-block',
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                backgroundColor: resolveEntityColor(record.color),
                                marginTop: 6,
                                flexShrink: 0,
                            }}
                        />
                    </Tooltip>
                    <div>
                        <div style={{ fontWeight: 500 }}>{title}</div>
                        {record.note && (
                            <Tooltip title={record.note}>
                                <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                    {record.note}
                                </Text>
                            </Tooltip>
                        )}
                    </div>
                </Space>
            ),
        },
        {
            title: 'Kỳ hạn',
            key: 'period',
            width: 190,
            render: (_: any, record: PeriodicTask) => (
                <Space orientation="vertical" size={0}>
                    <Tag>{PERIOD_TYPE_LABELS[record.periodType]}</Tag>
                    <Text style={{ fontSize: 12 }}>
                        {dayjs(record.periodStartDate).format('DD/MM/YYYY')}
                        {record.periodStartDate !== record.periodEndDate &&
                            ` → ${dayjs(record.periodEndDate).format('DD/MM/YYYY')}`}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 150,
            render: (_: any, record: PeriodicTask) => (
                <Tag color={record.status?.color ?? DEFAULT_ENTITY_COLOR}>{record.status?.name ?? '—'}</Tag>
            ),
        },
        {
            title: 'Phụ trách chính',
            key: 'primaryAssignee',
            width: 160,
            ellipsis: true,
            render: (_: any, record: PeriodicTask) => record.primaryAssignee?.name ?? '—',
        },
        {
            title: 'Phòng ban',
            key: 'department',
            width: 140,
            render: (_: any, record: PeriodicTask) =>
                record.department ? (
                    <Tag color={resolveEntityColor(record.department.color)}>{record.department.name}</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            // Luôn hiển thị (khác Phase 1) - nút "Liên kết" chỉ cần
            // `periodic_tasks.view` (ai đứng được ở trang này cũng có sẵn,
            // xem guard redirect đầu file), KHÔNG phụ thuộc canEdit/canDelete
            // như Sửa/Xoá bên dưới.
            title: 'Thao tác',
            key: 'action',
            width: 220,
            fixed: 'right' as const,
            render: (_: any, record: PeriodicTask) => (
                <Space>
                    <Button size="small" icon={<ApartmentOutlined />} onClick={() => setLinkingTask(record)}>
                        Liên kết
                    </Button>
                    {canEdit && (
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                            Sửa
                        </Button>
                    )}
                    {canDelete && (
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setDeletingTask(record)}
                        >
                            Xoá
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
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        Công việc định kỳ
                    </Title>
                    <Text type="secondary">
                        Công việc lặp lại theo Ngày/Tuần/Tháng/Năm, tạo thủ công từng kỳ (không có cơ chế tự sinh
                        lặp lại). Bạn chỉ thấy Task trong phạm vi quyền của mình (xem/sửa theo own/phòng ban/tất cả).
                    </Text>
                </div>
                <Space>
                    {canManageStatuses && (
                        <Button icon={<SettingOutlined />} onClick={() => router.push('/quan-ly-trang-thai-cong-viec')}>
                            Quản lý Trạng thái
                        </Button>
                    )}
                    {canCreate && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                            Tạo Công việc mới
                        </Button>
                    )}
                </Space>
            </div>

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} md={6}>
                    <Input
                        allowClear
                        placeholder="Tìm theo tiêu đề..."
                        prefix={<SearchOutlined />}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        placeholder="Loại kỳ"
                        style={{ width: '100%' }}
                        value={periodType}
                        onChange={(v) => setPeriodType(v)}
                        options={(Object.keys(PERIOD_TYPE_LABELS) as PeriodType[]).map((pt) => ({
                            value: pt,
                            label: PERIOD_TYPE_LABELS[pt],
                        }))}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        placeholder="Trạng thái"
                        style={{ width: '100%' }}
                        value={statusId}
                        onChange={(v) => setStatusId(v)}
                        options={statuses.map((s) => ({
                            value: s.id,
                            label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>,
                        }))}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder="Phụ trách chính"
                        style={{ width: '100%' }}
                        value={primaryAssigneeId}
                        onChange={(v) => setPrimaryAssigneeId(v)}
                        optionLabelProp="label"
                        optionRender={renderUserOption}
                        popupMatchSelectWidth={false}
                        options={users.map((u: any) => ({ value: u.id, label: u.name, user: u }))}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        placeholder="Phòng ban"
                        style={{ width: '100%' }}
                        value={departmentId}
                        onChange={(v) => setDepartmentId(v)}
                        options={departments.map((d) => ({
                            value: d.id,
                            label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
                        }))}
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <RangePicker
                        style={{ width: '100%' }}
                        format="DD/MM/YYYY"
                        placeholder={['Từ ngày', 'Đến ngày']}
                        value={dateRange as any}
                        onChange={(vals) => setDateRange(vals as [Dayjs | null, Dayjs | null] | null)}
                    />
                </Col>
            </Row>

            <Table
                rowKey="id"
                loading={isLoading || isFetching}
                columns={columns}
                dataSource={tasks}
                scroll={{ x: 'max-content' }}
                pagination={{
                    current: page,
                    pageSize: limit,
                    total: data?.total ?? 0,
                    showSizeChanger: true,
                    showTotal: (total) => `Tổng cộng ${total} Công việc`,
                    onChange: (p, ps) => {
                        setPage(p);
                        setLimit(ps);
                    },
                }}
            />

            {/* Modal Thêm/Sửa */}
            <Modal
                title={editingTask ? `Sửa "${editingTask.title}"` : 'Tạo Công việc định kỳ mới'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                width={640}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="title"
                        label="Tiêu đề"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tiêu đề' },
                            { max: 255, message: 'Tiêu đề tối đa 255 ký tự' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Gọi lại 5 khách tiềm năng" />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả" rules={[{ max: 1000, message: 'Mô tả quá dài' }]}>
                        <Input.TextArea rows={2} placeholder="Không bắt buộc" />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={10}>
                            <Form.Item
                                name="periodType"
                                label="Loại kỳ"
                                rules={[{ required: true, message: 'Chọn loại kỳ' }]}
                            >
                                <Select
                                    options={(Object.keys(PERIOD_TYPE_LABELS) as PeriodType[]).map((pt) => ({
                                        value: pt,
                                        label: PERIOD_TYPE_LABELS[pt],
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={14}>
                            <Form.Item
                                name="periodRange"
                                label="Khoảng thời gian của kỳ"
                                rules={[{ required: true, message: 'Chọn ngày bắt đầu/kết thúc kỳ' }]}
                                tooltip="Biên tuần/tháng/năm KHÔNG tự suy ra - bạn tự chọn đúng khoảng của kỳ này"
                            >
                                <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="primaryAssigneeId"
                                label="Người phụ trách chính"
                                rules={[{ required: true, message: 'Chọn người phụ trách chính' }]}
                            >
                                <Select
                                    showSearch={{ optionFilterProp: 'label' }}
                                    placeholder="Chọn nhân viên"
                                    optionLabelProp="label"
                                    optionRender={renderUserOption}
                                    popupMatchSelectWidth={false}
                                    options={users.map((u: any) => ({ value: u.id, label: u.name, user: u }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="departmentId"
                                label="Phòng ban"
                                tooltip="Bỏ trống sẽ tự lấy theo phòng ban của người phụ trách chính lúc tạo - sửa tự do sau đó"
                            >
                                <Select
                                    allowClear
                                    placeholder="Tự động theo người phụ trách"
                                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="statusId" label="Trạng thái" tooltip="Bỏ trống dùng mặc định 'Chưa hoàn thành'">
                                <Select
                                    allowClear
                                    placeholder="Chưa hoàn thành (mặc định)"
                                    options={statuses.map((s) => ({
                                        value: s.id,
                                        label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="color"
                                label="Màu Task"
                                tooltip="Chỉ dùng hiển thị UI (Card/Kanban/Calendar...) - không ảnh hưởng nghiệp vụ"
                                getValueFromEvent={(color) =>
                                    typeof color === 'string' ? color : color?.toHexString?.() ?? color
                                }
                            >
                                <ColorPicker showText format="hex" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="note" label="Ghi chú" rules={[{ max: 1000, message: 'Ghi chú quá dài' }]}>
                        <Input.TextArea rows={2} placeholder="Không bắt buộc" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Xoá - đơn giản, CHỈ Admin thấy được nút này */}
            <Modal
                title={`Xoá "${deletingTask?.title ?? ''}"?`}
                open={!!deletingTask}
                onCancel={() => setDeletingTask(null)}
                onOk={handleConfirmDelete}
                okButtonProps={{ danger: true }}
                okText="Xoá"
                cancelText="Huỷ"
                confirmLoading={deleteMutation.isPending}
            >
                <Alert
                    type="warning"
                    showIcon
                    title="Hành động này chỉ Admin mới thực hiện được và không thể hoàn tác qua UI."
                    style={{ marginBottom: 12 }}
                />
                <Text>Bạn có chắc muốn xoá Công việc định kỳ này?</Text>
            </Modal>

            {/* Modal Liên kết & Tiến độ (Phase 2) */}
            <TaskLinksModal open={!!linkingTask} onClose={() => setLinkingTask(null)} task={linkingTask} />
        </div>
    );
}