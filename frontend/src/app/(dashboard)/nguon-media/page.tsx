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
  InputNumber,
  App,
  Popconfirm,
  Typography,
  Alert,
  ColorPicker,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import {
  useMediaSources,
  useCreateMediaSource,
  useUpdateMediaSource,
  useLockMediaSource,
  useUnlockMediaSource,
  useDeleteMediaSource,
} from '@/lib/hooks/useMediaSources';
import { MediaSource } from '@/lib/api/media-sources.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';

const { Title, Text } = Typography;

export default function MediaSourcesPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  const { message } = App.useApp();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Khớp PERMISSIONS.md §2.5 (đối chiếu trực tiếp code 2026-08-28):
  // create/update/lock/unlock đã là @Roles(ADMIN, ASSISTANT) - Manager
  // KHÔNG có quyền ghi ở module này (quyết định chốt riêng, khác Customer/
  // ZK Device - module chưa có khái niệm phòng ban gắn với Media Source).
  // remove (Xoá) tách riêng @Roles(ADMIN) - xem canDelete bên dưới.
  useEffect(() => {
    if (!permissionsLoading && user && !can('media_sources.view')) {
      router.replace('/customers');
    }
  }, [user, router]);

  const canDelete = user?.role === 'admin';

  const { sources, isLoading } = useMediaSources(false);
  const createMutation = useCreateMediaSource();
  const updateMutation = useUpdateMediaSource();
  const lockMutation = useLockMediaSource();
  const unlockMutation = useUnlockMediaSource();
  const deleteMutation = useDeleteMediaSource();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<MediaSource | null>(null);
  const [form] = Form.useForm();

  const openCreateModal = () => {
    setEditingSource(null);
    form.resetFields();
    form.setFieldsValue({ color: '#1677ff' });
    setModalOpen(true);
  };

  const openEditModal = (source: MediaSource) => {
    setEditingSource(source);
    form.setFieldsValue({ name: source.name, color: source.color, sortOrder: source.sortOrder });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingSource) {
        updateMutation.mutate(
          { id: editingSource.id, data: values },
          {
            onSuccess: () => {
              message.success('Đã cập nhật nguồn');
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
            message.success('Đã thêm nguồn mới');
            setModalOpen(false);
          },
          onError: (err: any) => {
            message.error(err?.response?.data?.message || 'Thêm nguồn thất bại');
          },
        });
      }
    } catch {
      // lỗi validate form - antd tự hiển thị, không cần xử lý thêm
    }
  };

  const handleToggleLock = (source: MediaSource) => {
    const mutation = source.isLocked ? unlockMutation : lockMutation;
    mutation.mutate(source.id, {
      onSuccess: () => message.success(source.isLocked ? 'Đã mở khoá' : 'Đã khoá nguồn'),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Thao tác thất bại'),
    });
  };

  const handleDelete = (source: MediaSource) => {
    deleteMutation.mutate(source.id, {
      onSuccess: () => message.success(`Đã xoá nguồn "${source.name}"`),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Xoá thất bại'),
    });
  };

  const columns = [
    {
      title: 'Tên nguồn',
      dataIndex: 'name',
      key: 'name',
      // Hiển thị dạng Tag tô đúng màu đã lưu, thay vì chữ thường - để admin
      // thấy ngay màu nào đang gắn với nguồn nào trong chính bảng quản lý.
      render: (name: string, record: MediaSource) => (
        <Tag color={record.color} style={{ marginRight: 0 }}>
          {name}
        </Tag>
      ),
    },
    {
      title: 'Thứ tự hiển thị',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 140,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 160,
      render: (_: any, record: MediaSource) =>
        record.isLocked ? (
          <Tag color="red">Đã khoá</Tag>
        ) : (
          <Tag color="green">Đang mở</Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 260,
      render: (_: any, record: MediaSource) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Sửa
          </Button>
          <Button
            size="small"
            icon={record.isLocked ? <UnlockOutlined /> : <LockOutlined />}
            onClick={() => handleToggleLock(record)}
          >
            {record.isLocked ? 'Mở khoá' : 'Khoá'}
          </Button>
          {canDelete && (
            <Popconfirm
              title={`Xoá nguồn "${record.name}"?`}
              description="Chỉ xoá được nếu chưa có khách hàng nào đang dùng nguồn này."
              onConfirm={() => handleDelete(record)}
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
            Quản lý nguồn khách hàng
          </Title>
          <Text type="secondary">
            Danh sách nguồn hiển thị trong dropdown "Nguồn" khi thêm khách hàng mới. Nguồn bị khoá
            sẽ không xuất hiện trong dropdown thêm mới, nhưng khách hàng cũ dùng nguồn đó vẫn hiển
            thị bình thường.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Thêm nguồn mới
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={sources}
        pagination={false}
      />

      <Modal
        title={editingSource ? `Sửa nguồn "${editingSource.name}"` : 'Thêm nguồn mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        {editingSource && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            title="Đổi tên KHÔNG cập nhật lại các khách hàng cũ đang dùng tên nguồn hiện tại - họ vẫn giữ nguyên tên cũ."
          />
        )}
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Tên nguồn"
            rules={[
              { required: true, message: 'Vui lòng nhập tên nguồn' },
              { max: 100, message: 'Tên nguồn tối đa 100 ký tự' },
            ]}
          >
            <Input placeholder="Ví dụ: Zalo" />
          </Form.Item>
          <Form.Item
            name="color"
            label="Màu hiển thị"
            rules={[{ required: true, message: 'Vui lòng chọn màu' }]}
            // ColorPicker của antd bắn ra 1 object Color qua onChange, không
            // phải string - getValueFromEvent quy về hex string ngay tại
            // Form.Item để phần còn lại của form (submit, setFieldsValue khi
            // mở lại modal) chỉ cần làm việc với string, khỏi phải convert
            // rải rác nhiều chỗ.
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
    </div>
  );
}