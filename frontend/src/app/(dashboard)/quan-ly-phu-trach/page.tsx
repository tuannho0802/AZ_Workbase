'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Button, Tag, Space, Modal, Form, Input, Select, App, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { usePositions } from '@/lib/hooks/usePositions';
import {
  useAssignmentGroups,
  useCreateAssignmentGroup,
  useUpdateAssignmentGroup,
  useDeleteAssignmentGroup,
} from '@/lib/hooks/useAssignmentGroups';
import { AssignmentGroupConfig } from '@/lib/api/assignment-groups.api';

const { Title, Text } = Typography;

/**
 * "Quản lý phụ trách" (Assignment Group Config) - thay hardcode dò tên
 * phòng ban ("kinh doanh"/"marketing") ở customers/page.tsx và lọc
 * position.code==='content' ở GroupManagersModal.tsx bằng bảng Admin tự
 * cấu hình: "nhóm phụ trách X gồm N Phòng ban (BẮT BUỘC >=1) + N Vị trí
 * (TUỲ CHỌN)". 3 config hệ thống seed sẵn (`sales`/`marketing`/
 * `content_staff`) không xoá được, chỉ sửa được danh sách phòng ban/vị trí.
 */
export default function AssignmentGroupsPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const { message } = App.useApp();
  const router = useRouter();

    // ⚠️ Tách nhỏ theo action từ `assignment_groups.manage` gộp chung (khớp
    // @RequirePermission ở assignment-groups.controller.ts) - vào trang cần
    // `view`, còn nút Thêm/Sửa/Xoá gate riêng theo `create`/`update`/`delete`.
  useEffect(() => {
      if (!permissionsLoading && !can('assignment_groups.view')) {
      router.replace('/customers');
    }
  }, [router, permissionsLoading, can]);

    const canCreate = can('assignment_groups.create');
    const canUpdate = can('assignment_groups.update');
    const canDelete = can('assignment_groups.delete');

  const { configs, isLoading } = useAssignmentGroups();
  const { departments, isLoading: loadingDepartments } = useDepartments();
  const { positions, isLoading: loadingPositions } = usePositions();
  const createMutation = useCreateAssignmentGroup();
  const updateMutation = useUpdateAssignmentGroup();
  const deleteMutation = useDeleteAssignmentGroup();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentGroupConfig | null>(null);
  const [form] = Form.useForm();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<AssignmentGroupConfig | null>(null);

  const openCreateModal = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (config: AssignmentGroupConfig) => {
    setEditing(config);
    form.setFieldsValue({
      key: config.key,
      name: config.name,
      description: config.description,
      departmentIds: config.departments.map((d) => d.departmentId),
      positionIds: config.positions.map((p) => p.positionId),
    });
    setModalOpen(true);
  };

  const openDeleteModal = (config: AssignmentGroupConfig) => {
    setDeleting(config);
    setDeleteModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        description: values.description,
        departmentIds: values.departmentIds,
        positionIds: values.positionIds ?? [],
      };
      if (editing) {
        updateMutation.mutate(
          { id: editing.id, data: payload },
          {
            onSuccess: () => {
              message.success('Đã cập nhật "Quản lý phụ trách"');
              setModalOpen(false);
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
          },
        );
      } else {
        createMutation.mutate(
          { key: values.key, ...payload },
          {
            onSuccess: () => {
              message.success('Đã tạo "Quản lý phụ trách" mới');
              setModalOpen(false);
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Tạo thất bại'),
          },
        );
      }
    } catch {
      // lỗi validate form - antd tự hiển thị
    }
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        message.success(`Đã xoá "${deleting.name}"`);
        setDeleteModalOpen(false);
        setDeleting(null);
      },
      onError: (err: any) => message.error(err?.response?.data?.message || 'Xoá thất bại'),
    });
  };

  const columns = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: 160,
      render: (key: string) => <Text code>{key}</Text>,
    },
    { title: 'Tên', dataIndex: 'name', key: 'name' },
    {
      title: 'Phòng ban (bắt buộc)',
      key: 'departments',
      render: (_: any, record: AssignmentGroupConfig) =>
        record.departments.length ? (
          <Space wrap size={4}>
            {record.departments.map((d) => (
              <Tag color="blue" key={d.departmentId}>
                {d.department?.name ?? d.departmentId}
              </Tag>
            ))}
          </Space>
        ) : (
          <Tag color="red">Chưa cấu hình - dropdown sẽ rỗng</Tag>
        ),
    },
    {
      title: 'Vị trí (tuỳ chọn)',
      key: 'positions',
      render: (_: any, record: AssignmentGroupConfig) =>
        record.positions.length ? (
          <Space wrap size={4}>
            {record.positions.map((p) => (
              <Tag color="purple" key={p.positionId}>
                {p.position?.name ?? p.positionId}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">Không lọc theo vị trí</Text>
        ),
    },
    {
      title: 'Loại',
      dataIndex: 'isSystem',
      key: 'isSystem',
      width: 110,
      render: (isSystem: boolean) => (isSystem ? <Tag color="gold">Hệ thống</Tag> : <Tag>Tuỳ chỉnh</Tag>),
    },
      ...(canUpdate || canDelete
      ? [
          {
            title: 'Thao tác',
            key: 'action',
            width: 160,
            render: (_: any, record: AssignmentGroupConfig) => (
              <Space wrap>
                    {canUpdate && (
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
            Quản lý phụ trách
          </Title>
          <Text type="secondary">
            Cấu hình danh sách nhân sự hợp lệ cho các dropdown "phụ trách" (Sales phụ trách, Marketing
            phụ trách, Nhân viên Content...) theo Phòng ban (bắt buộc) + Vị trí (tuỳ chọn) - không cần
            sửa code khi tổ chức thay đổi.
          </Text>
        </div>
              {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Thêm nhóm phụ trách
          </Button>
        )}
      </div>

      <Table rowKey="id" loading={isLoading} columns={columns} dataSource={configs} pagination={false} />

      <Modal
        title={editing ? `Sửa "${editing.name}"` : 'Thêm nhóm phụ trách mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={560}
      >
        <Form form={form} layout="vertical">
          {!editing && (
            <Form.Item
              name="key"
              label="Key"
              extra="Chỉ chữ thường, số và dấu gạch dưới. KHÔNG đổi được sau khi tạo - dùng làm định danh cho API GET /assignment-groups/:key/users."
              rules={[
                { required: true, message: 'Vui lòng nhập key' },
                { pattern: /^[a-z0-9_]+$/, message: 'Chỉ chữ thường, số và dấu gạch dưới' },
                { max: 50, message: 'Key tối đa 50 ký tự' },
              ]}
            >
              <Input placeholder="Ví dụ: content_staff" />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label="Tên hiển thị"
            rules={[
              { required: true, message: 'Vui lòng nhập tên' },
              { max: 100, message: 'Tên quá dài' },
            ]}
          >
            <Input placeholder="Ví dụ: Nhân viên Content" />
          </Form.Item>
          <Form.Item
            name="departmentIds"
            label="Phòng ban (bắt buộc chọn ít nhất 1)"
            rules={[{ required: true, message: 'Phải chọn ít nhất 1 phòng ban' }]}
          >
            <Select
              mode="multiple"
              placeholder="Chọn 1 hoặc nhiều phòng ban"
              loading={loadingDepartments}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="positionIds"
            label="Vị trí (tuỳ chọn - để trống = không lọc theo vị trí)"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Không lọc theo vị trí"
              loading={loadingPositions}
              options={positions.map((p) => ({ value: p.id, label: p.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="description" label="Mô tả (tuỳ chọn)">
            <Input.TextArea rows={2} placeholder="Mô tả ngắn về nhóm phụ trách này" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Xoá "${deleting?.name}"`}
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleting(null);
        }}
        onOk={handleDelete}
        okText="Xoá"
        okButtonProps={{ danger: true }}
        confirmLoading={deleteMutation.isPending}
      >
        <Text>
          Bạn có chắc muốn xoá "{deleting?.name}"? Các dropdown đang dùng key này sẽ trả về danh sách
          rỗng cho tới khi tạo lại config khác cùng key.
        </Text>
      </Modal>
    </div>
  );
}