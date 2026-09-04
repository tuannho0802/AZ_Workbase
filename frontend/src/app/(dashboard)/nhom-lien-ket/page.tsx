'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  App,
  Popconfirm,
  Typography,
  ColorPicker,
  Select,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  LinkOutlined,
  TeamOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import {
  useLinkCategories,
  useCreateLinkCategory,
  useUpdateLinkCategory,
  useLockLinkCategory,
  useUnlockLinkCategory,
  useDeleteLinkCategory,
  useAllLinkGroups,
  useCreateLinkGroup,
  useUpdateLinkGroup,
  useActivateLinkGroup,
  useDeactivateLinkGroup,
  useDeleteLinkGroup,
} from '@/lib/hooks/useLinkGroups';
import { LinkCategory, LinkGroup } from '@/lib/api/link-groups.api';
import { usersApi } from '@/lib/api/users.api';
import { GroupManagersModal } from '@/components/link-groups/GroupManagersModal';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';

const { Title, Text } = Typography;

interface UserOption {
  id: number;
  name: string;
  email: string;
}

export default function LinkGroupsAdminPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  const { message } = App.useApp();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Khớp PERMISSIONS.md §2.4 (đối chiếu trực tiếp code 2026-08-28): CRUD
  // Category/Group đã là @Roles(ADMIN, ASSISTANT) - Manager KHÔNG có quyền
  // ghi ở module này (quyết định chốt riêng, module chưa có khái niệm
  // phòng ban gắn với Category/Group). Delete tách riêng @Roles(ADMIN) -
  // xem canDelete ở các chỗ render nút Xoá bên dưới.
  useEffect(() => {
    if (!permissionsLoading && user && !can('link_groups.view')) {
      router.replace('/customers');
    }
  }, [user, router]);

  const canDelete = can('link_groups.delete');
  // ⚠️ FIX BUG THẬT (rà soát UI Permission - đợt kiểm tra Tabs/component/cột):
  // trước đây các nút Sửa/Thêm nhóm/Thêm category/Khoá-Mở KHÔNG gate theo
  // permission gì - hiện ra cho mọi user có `link_groups.view` (kể cả
  // Manager, dù §2.4 đã chốt Manager KHÔNG có quyền ghi ở module này). Bấm
  // vào sẽ dính 403 từ `link_groups.manage` ở BE.
  const canManage = can('link_groups.manage');
  const isAdmin = user?.role === 'admin';
  const currentUserId = user?.id;

  const { categories, isLoading: loadingCategories } = useLinkCategories(false);
  const { groups, isLoading: loadingGroups } = useAllLinkGroups();

  // Dùng để chọn "Quản lý chính" trong form Thêm/Sửa nhóm - endpoint mở
  // cho mọi role đã đăng nhập nên gọi thẳng không cần check role ở đây.
  const { data: users } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
  });
  const userOptions = (users ?? []).map((u) => ({ value: u.id, label: u.name || u.email }));

  const createCategoryMutation = useCreateLinkCategory();
  const updateCategoryMutation = useUpdateLinkCategory();
  const lockCategoryMutation = useLockLinkCategory();
  const unlockCategoryMutation = useUnlockLinkCategory();
  const deleteCategoryMutation = useDeleteLinkCategory();

  const createGroupMutation = useCreateLinkGroup();
  const updateGroupMutation = useUpdateLinkGroup();
  const activateGroupMutation = useActivateLinkGroup();
  const deactivateGroupMutation = useDeactivateLinkGroup();
  const deleteGroupMutation = useDeleteLinkGroup();

  // ── Modal Category ──
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LinkCategory | null>(null);
  const [categoryForm] = Form.useForm();

  const openCreateCategory = () => {
    setEditingCategory(null);
    categoryForm.resetFields();
    categoryForm.setFieldsValue({ color: '#1677ff' });
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: LinkCategory) => {
    setEditingCategory(category);
    categoryForm.setFieldsValue({
      name: category.name,
      color: category.color,
      sortOrder: category.sortOrder,
    });
    setCategoryModalOpen(true);
  };

  const handleSubmitCategory = async () => {
    try {
      const values = await categoryForm.validateFields();
      if (editingCategory) {
        updateCategoryMutation.mutate(
          { id: editingCategory.id, data: values },
          {
            onSuccess: () => {
              message.success('Đã cập nhật category');
              setCategoryModalOpen(false);
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
          },
        );
      } else {
        createCategoryMutation.mutate(values, {
          onSuccess: () => {
            message.success('Đã thêm category mới');
            setCategoryModalOpen(false);
          },
          onError: (err: any) => message.error(err?.response?.data?.message || 'Thêm category thất bại'),
        });
      }
    } catch {
      // lỗi validate form - antd tự hiển thị
    }
  };

  const handleToggleLockCategory = (category: LinkCategory) => {
    const mutation = category.isLocked ? unlockCategoryMutation : lockCategoryMutation;
    mutation.mutate(category.id, {
      onSuccess: () => message.success(category.isLocked ? 'Đã mở khoá' : 'Đã khoá category'),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Thao tác thất bại'),
    });
  };

  const handleDeleteCategory = (category: LinkCategory) => {
    deleteCategoryMutation.mutate(category.id, {
      onSuccess: () => message.success(`Đã xoá category "${category.name}"`),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Xoá thất bại'),
    });
  };

  // ── Modal Group ──
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LinkGroup | null>(null);
  const [groupCategoryId, setGroupCategoryId] = useState<number | null>(null);
  const [groupForm] = Form.useForm();

  const openCreateGroup = (categoryId: number) => {
    setEditingGroup(null);
    setGroupCategoryId(categoryId);
    groupForm.resetFields();
    setGroupModalOpen(true);
  };

  const openEditGroup = (group: LinkGroup) => {
    setEditingGroup(group);
    setGroupCategoryId(group.categoryId);
    groupForm.setFieldsValue({
      name: group.name,
      url: group.url,
      sortOrder: group.sortOrder,
      primaryManagerId: group.primaryManager?.id ?? null,
    });
    setGroupModalOpen(true);
  };

  // ── Modal xem/quản lý Quản lý phụ của 1 nhóm ──
  const [managingGroup, setManagingGroup] = useState<{ id: number; name: string } | null>(null);

  const handleSubmitGroup = async () => {
    try {
      const values = await groupForm.validateFields();
      if (editingGroup) {
        updateGroupMutation.mutate(
          { id: editingGroup.id, data: values },
          {
            onSuccess: () => {
              message.success('Đã cập nhật nhóm');
              setGroupModalOpen(false);
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Cập nhật thất bại'),
          },
        );
      } else if (groupCategoryId) {
        createGroupMutation.mutate(
          { ...values, categoryId: groupCategoryId },
          {
            onSuccess: () => {
              message.success('Đã thêm nhóm mới');
              setGroupModalOpen(false);
            },
            onError: (err: any) => message.error(err?.response?.data?.message || 'Thêm nhóm thất bại'),
          },
        );
      }
    } catch {
      // lỗi validate form - antd tự hiển thị
    }
  };

  const handleToggleActiveGroup = (group: LinkGroup) => {
    const mutation = group.isActive ? deactivateGroupMutation : activateGroupMutation;
    mutation.mutate(group.id, {
      onSuccess: () => message.success(group.isActive ? 'Đã ẩn nhóm' : 'Đã hiện lại nhóm'),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Thao tác thất bại'),
    });
  };

  const handleDeleteGroup = (group: LinkGroup) => {
    deleteGroupMutation.mutate(group.id, {
      onSuccess: () => message.success(`Đã xoá nhóm "${group.name}"`),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Xoá thất bại'),
    });
  };

  const groupColumns = [
    {
      title: 'Tên nhóm',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <LinkOutlined /> {url}
        </a>
      ),
    },
    {
      title: 'Thứ tự',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 90,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_: any, group: LinkGroup) =>
        group.isActive ? <Tag color="green">Đang hiện</Tag> : <Tag color="red">Đã ẩn</Tag>,
    },
    {
      title: 'Quản lý chính/phụ',
      key: 'managers',
      width: 220,
      render: (_: any, group: LinkGroup) => (
        <Space size={4} wrap>
          {group.primaryManager ? (
            <Tag color="gold" icon={<CrownOutlined />}>
              {group.primaryManager.name}
            </Tag>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chưa gán chính
            </Text>
          )}
          {(group.secondaryManagers?.length ?? 0) > 0 && (
            <Tag color="blue">+{group.secondaryManagers!.length} phụ</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 320,
      render: (_: any, group: LinkGroup) => {
        // Nút "Quản lý phụ" mở GroupManagersModal - BE (`getManagers()`,
        // LinkGroupAccessHelper.canManage()) chỉ cho admin/chính quản lý
        // chính/chính quản lý phụ CỦA ĐÚNG NHÓM ĐÓ xem, KHÁC hẳn permission
        // chung `link_groups.manage` (đây là quyền theo TỪNG resource cụ
        // thể - ngoại lệ có chủ đích, xem PERMISSIONS.md mục 1.6, giống hệt
        // cách GroupManagersModal.tsx tự tính `canEdit`). Trước đây nút này
        // hiện cho MỌI người có `link_groups.view` (vd 1 Manager không liên
        // quan gì tới nhóm này) - bấm vào Modal fetch `getManagers()` sẽ
        // dính 403 ngay, không phải bug permission chung mà là thiếu check
        // theo resource - phải tính riêng ở đây, không thể dùng `can()`.
        const isPrimaryOfThisGroup = group.primaryManagerId === currentUserId;
        const isSecondaryOfThisGroup = (group.secondaryManagers ?? []).some(
          (m) => m.user.id === currentUserId,
        );
        const canSeeManagers = isAdmin || isPrimaryOfThisGroup || isSecondaryOfThisGroup;

        return (
          <Space>
            {canManage && (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditGroup(group)}>
                Sửa
              </Button>
            )}
            {canSeeManagers && (
              <Button
                size="small"
                icon={<TeamOutlined />}
                onClick={() => setManagingGroup({ id: group.id, name: group.name })}
              >
                Quản lý phụ
              </Button>
            )}
            {canManage && (
              <Button size="small" onClick={() => handleToggleActiveGroup(group)}>
                {group.isActive ? 'Ẩn' : 'Hiện lại'}
              </Button>
            )}
            {canDelete && (
              <Popconfirm
                title={`Xoá nhóm "${group.name}"?`}
                description="Chỉ xoá được nếu chưa có khách hàng nào có dữ liệu join gắn với nhóm này."
                onConfirm={() => handleDeleteGroup(group)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Xoá
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  const categoryColumns = [
    {
      title: 'Category (nền tảng)',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: LinkCategory) => <Tag color={record.color}>{name}</Tag>,
    },
    {
      title: 'Số nhóm',
      key: 'groupCount',
      width: 100,
      render: (_: any, record: LinkCategory) =>
        groups.filter((g) => g.categoryId === record.id).length,
    },
    {
      title: 'Thứ tự',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 90,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_: any, record: LinkCategory) =>
        record.isLocked ? <Tag color="red">Đã khoá</Tag> : <Tag color="green">Đang mở</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 340,
      render: (_: any, record: LinkCategory) => (
        <Space>
          {canManage && (
            <>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openCreateGroup(record.id)}>
                Thêm nhóm
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditCategory(record)}>
                Sửa
              </Button>
              <Button
                size="small"
                icon={record.isLocked ? <UnlockOutlined /> : <LockOutlined />}
                onClick={() => handleToggleLockCategory(record)}
              >
                {record.isLocked ? 'Mở khoá' : 'Khoá'}
              </Button>
            </>
          )}
          {canDelete && (
            <Popconfirm
              title={`Xoá category "${record.name}"?`}
              description="Chỉ xoá được nếu chưa có nhóm nào thuộc category này."
              onConfirm={() => handleDeleteCategory(record)}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                Xoá
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Quản lý nhóm liên kết (Zalo/Facebook/Threads...)
          </Title>
          <Text type="secondary">
            Category là nền tảng (Zalo, Facebook, Instagram, Threads...). Mỗi Category có nhiều Group
            (nhóm cụ thể, mỗi nhóm 1 URL riêng). Tên Category nên đặt TRÙNG với tên trong "Quản lý
            nguồn" để checklist "đã join nhóm" tự lọc đúng khi thêm khách hàng theo nguồn tương ứng.
          </Text>
        </div>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateCategory}>
            Thêm category mới
          </Button>
        )}
      </div>

      <Table
        rowKey="id"
        loading={loadingCategories || loadingGroups}
        columns={categoryColumns}
        dataSource={categories}
        pagination={false}
        expandable={{
          expandedRowRender: (record: LinkCategory) => (
            <Table
              rowKey="id"
              size="small"
              columns={groupColumns}
              dataSource={groups.filter((g) => g.categoryId === record.id)}
              pagination={false}
              locale={{ emptyText: 'Chưa có nhóm nào - bấm "Thêm nhóm" ở dòng category để tạo mới' }}
            />
          ),
        }}
      />

      <Modal
        title={editingCategory ? `Sửa category "${editingCategory.name}"` : 'Thêm category mới'}
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        onOk={handleSubmitCategory}
        confirmLoading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
      >
        <Form form={categoryForm} layout="vertical">
          <Form.Item
            name="name"
            label="Tên category"
            rules={[
              { required: true, message: 'Vui lòng nhập tên category' },
              { max: 100, message: 'Tên tối đa 100 ký tự' },
            ]}
          >
            <Input placeholder="Ví dụ: Zalo" />
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

      <Modal
        title={editingGroup ? `Sửa nhóm "${editingGroup.name}"` : 'Thêm nhóm mới'}
        open={groupModalOpen}
        onCancel={() => setGroupModalOpen(false)}
        onOk={handleSubmitGroup}
        confirmLoading={createGroupMutation.isPending || updateGroupMutation.isPending}
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item
            name="name"
            label="Tên nhóm"
            rules={[
              { required: true, message: 'Vui lòng nhập tên nhóm' },
              { max: 255, message: 'Tên tối đa 255 ký tự' },
            ]}
          >
            <Input placeholder="Ví dụ: Nhóm Zalo Sales Hà Nội" />
          </Form.Item>
          <Form.Item
            name="url"
            label="URL nhóm"
            rules={[
              { required: true, message: 'Vui lòng nhập URL' },
              { type: 'url', message: 'URL không hợp lệ' },
            ]}
          >
            <Input placeholder="https://zalo.me/g/abcxyz" />
          </Form.Item>
          <Form.Item name="sortOrder" label="Thứ tự hiển thị trong category">
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
          </Form.Item>
          <Form.Item
            name="primaryManagerId"
            label="Quản lý chính"
            tooltip="Người chịu trách nhiệm chính cho nhóm này - chỉ admin gán/đổi được. Có thể thêm nhiều Quản lý phụ sau khi tạo, qua nút 'Quản lý phụ'."
          >
            <Select
              allowClear
              showSearch={{
                filterOption: (input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase()),
              }}
              placeholder="Chưa gán ai làm Quản lý chính"
              options={userOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      <GroupManagersModal
        open={!!managingGroup}
        onClose={() => setManagingGroup(null)}
        groupId={managingGroup?.id ?? null}
        groupName={managingGroup?.name}
      />
    </div>
  );
}