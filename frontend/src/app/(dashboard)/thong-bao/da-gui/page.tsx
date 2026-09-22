'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
  App,
  Avatar,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Progress,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useAuthStore } from '@/lib/stores/auth.store';
import { SendBroadcastModal } from '@/components/notifications/SendBroadcastModal';
import {
  useSentBroadcasts,
  useBroadcastRecipients,
  useUpdateBroadcast,
  useRemoveBroadcast,
} from '@/lib/hooks/useNotificationBroadcasts';
import type {
  BroadcastListItem,
  BroadcastRecipientStatus,
} from '@/lib/api/notification-broadcasts.api';

const { Text, Paragraph } = Typography;

/** Tag "Đối tượng" (PLAN 7.7): "3 người" / "2 phòng ban" / "Toàn bộ". */
function audienceTag(item: BroadcastListItem) {
  if (item.audienceType === 'ALL') return <Tag color="purple">Toàn bộ</Tag>;
  if (item.audienceType === 'DEPARTMENTS') {
    const n = item.audienceParams?.departmentIds?.length ?? 0;
    return <Tag color="blue">{n} phòng ban</Tag>;
  }
  const n = item.audienceParams?.userIds?.length ?? item.recipientCount;
  return <Tag color="default">{n} người</Tag>;
}

const RECIPIENT_STATUS_TABS: { key: BroadcastRecipientStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'read', label: 'Đã đọc' },
];

/**
 * `/thong-bao/da-gui` (PLAN mục 7.7) - permission `notification_broadcasts.view`.
 * Bảng lịch sử + Drawer chi tiết (Tabs đọc/chưa đọc, Sửa/Xoá dùng đúng
 * `PATCH`/`DELETE` đã có sẵn ở M1).
 */
export default function SentBroadcastsPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const { user } = useAuthStore();
  const router = useRouter();
  const { message, modal } = App.useApp();

  const canCreate = can('notification_broadcasts.create');
  const canEdit = can('notification_broadcasts.edit');
  const canDelete = can('notification_broadcasts.delete');

  useEffect(() => {
    if (!permissionsLoading && user && !can('notification_broadcasts.view')) {
      message.warning('Bạn không có quyền xem lịch sử thông báo đã gửi');
      router.replace('/thong-bao');
    }
  }, [user, permissionsLoading, router, message]);

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selected, setSelected] = useState<BroadcastListItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm] = Form.useForm();
  const [recipientStatus, setRecipientStatus] = useState<BroadcastRecipientStatus>('all');
  const [recipientSearch, setRecipientSearch] = useState('');

  const list = useSentBroadcasts(20);
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  const recipients = useBroadcastRecipients(selected?.id ?? null, recipientStatus, recipientSearch);
  const recipientRows = recipients.data?.pages.flatMap((p) => p.data) ?? [];

  const updateMutation = useUpdateBroadcast();
  const removeMutation = useRemoveBroadcast();

  const openDetail = (item: BroadcastListItem) => {
    setSelected(item);
    setEditing(false);
    setRecipientStatus('all');
    setRecipientSearch('');
  };

  const closeDetail = () => {
    setSelected(null);
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    try {
      const values = await editForm.validateFields();
      const updated = await updateMutation.mutateAsync({ id: selected.id, ...values });
      setSelected(updated);
      setEditing(false);
      message.success('Đã cập nhật thông báo');
    } catch {
      // validate lỗi hoặc axios interceptor đã hiện message.error
    }
  };

  const handleDelete = async (item: BroadcastListItem) => {
    try {
      await removeMutation.mutateAsync(item.id);
      message.success('Đã xoá thông báo khỏi mọi hộp thư người nhận');
      if (selected?.id === item.id) closeDetail();
    } catch {
      // axios interceptor đã hiện message.error
    }
  };

  const confirmDelete = (item: BroadcastListItem) => {
    modal.confirm({
      title: 'Xoá thông báo này?',
      content: 'Thông báo sẽ bị xoá khỏi mọi hộp thư người nhận. Hành động không thể hoàn tác.',
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => handleDelete(item),
    });
  };

  const columns: ColumnsType<BroadcastListItem> = useMemo(
    () => [
      {
        title: 'Tiêu đề',
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (title: string, record) => (
          <Space orientation="vertical" size={0}>
            <Text strong>{title}</Text>
            {record.updatedAt && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                Đã chỉnh sửa lúc {dayjs(record.updatedAt).format('HH:mm DD/MM/YYYY')}
              </Text>
            )}
          </Space>
        ),
      },
      {
        title: 'Người gửi',
        dataIndex: 'senderName',
        key: 'senderName',
        width: 150,
        render: (name?: string | null) => name || '—',
      },
      {
        title: 'Thời gian',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 140,
        render: (date: string) => dayjs(date).format('HH:mm DD/MM/YYYY'),
      },
      {
        title: 'Đối tượng',
        key: 'audience',
        width: 130,
        render: (_, record) => audienceTag(record),
      },
      {
        title: 'Tiến độ đọc',
        key: 'progress',
        width: 200,
        render: (_, record) => {
          const total = record.readCount + record.unreadCount;
          const percent = total > 0 ? Math.round((record.readCount / total) * 100) : 0;
          return (
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Progress percent={percent} size="small" showInfo={false} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.readCount}/{total} đã đọc
              </Text>
            </Space>
          );
        },
      },
      {
        title: 'Thao tác',
        key: 'action',
        width: 110,
        render: (_, record) => (
          <Space size="small">
            {canEdit && (
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  openDetail(record);
                  setEditing(true);
                  editForm.setFieldsValue({ title: record.title, body: record.body });
                }}
              />
            )}
            {canDelete && (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(record);
                }}
              />
            )}
          </Space>
        ),
      },
    ],
    [canEdit, canDelete],
  );

  if (permissionsLoading) return null;
  if (!can('notification_broadcasts.view')) return null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Thông báo đã gửi
        </Typography.Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setSendModalOpen(true)}>
            Soạn thông báo mới
          </Button>
        )}
      </div>

      <Card>
        <Table<BroadcastListItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={list.isLoading}
          pagination={false}
          locale={{ emptyText: <Empty description="Chưa gửi thông báo nào" /> }}
          onRow={(record) => ({ onClick: () => openDetail(record), style: { cursor: 'pointer' } })}
        />
        {list.hasNextPage && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              Tải thêm
            </Button>
          </div>
        )}
      </Card>

      <SendBroadcastModal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        onSent={() => list.refetch()}
      />

      <Drawer
        title={selected?.title}
        open={!!selected}
        onClose={closeDetail}
        size={560}
        extra={
          selected && (
            <Space>
              {canEdit && !editing && (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(true);
                    editForm.setFieldsValue({ title: selected.title, body: selected.body });
                  }}
                >
                  Sửa
                </Button>
              )}
              {canDelete && (
                <Popconfirm
                  title="Xoá thông báo này?"
                  description="Sẽ mất khỏi mọi hộp thư người nhận."
                  okText="Xoá"
                  okButtonProps={{ danger: true }}
                  cancelText="Huỷ"
                  onConfirm={() => handleDelete(selected)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Xoá
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
      >
        {selected && (
          <>
            {editing ? (
              <Form form={editForm} layout="vertical" style={{ marginBottom: 24 }}>
                <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }, { max: 200 }]}>
                  <Input showCount maxLength={200} />
                </Form.Item>
                <Form.Item name="body" label="Nội dung" rules={[{ required: true }, { max: 2000 }]}>
                  <Input.TextArea rows={4} showCount maxLength={2000} />
                </Form.Item>
                <Space>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={updateMutation.isPending}
                    onClick={handleSaveEdit}
                  >
                    Lưu
                  </Button>
                  <Button onClick={() => setEditing(false)}>Huỷ</Button>
                </Space>
              </Form>
            ) : (
              <>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selected.body}</Paragraph>
                {selected.updatedAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Đã chỉnh sửa lúc {dayjs(selected.updatedAt).format('HH:mm DD/MM/YYYY')}
                  </Text>
                )}
              </>
            )}

            <div style={{ margin: '16px 0', display: 'flex', gap: 24 }}>
              <Space direction="vertical" size={0}>
                <Text type="secondary">Đã đọc</Text>
                <Text strong style={{ fontSize: 18, color: '#52c41a' }}>
                  {selected.readCount}
                </Text>
              </Space>
              <Space direction="vertical" size={0}>
                <Text type="secondary">Chưa đọc</Text>
                <Text strong style={{ fontSize: 18, color: '#faad14' }}>
                  {selected.unreadCount}
                </Text>
              </Space>
              <Space direction="vertical" size={0}>
                <Text type="secondary">Đối tượng</Text>
                {audienceTag(selected)}
              </Space>
            </div>

            <Tabs
              activeKey={recipientStatus}
              onChange={(k) => setRecipientStatus(k as BroadcastRecipientStatus)}
              items={RECIPIENT_STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
            />
            <Input.Search
              placeholder="Tìm theo tên..."
              allowClear
              onSearch={setRecipientSearch}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="notificationId"
              size="small"
              loading={recipients.isLoading}
              pagination={false}
              dataSource={recipientRows}
              locale={{ emptyText: <Empty description="Không có người nhận" /> }}
              columns={[
                {
                  title: 'Nhân viên',
                  key: 'name',
                  render: (_, r) => (
                    <Space>
                      <Avatar size="small" icon={<UserOutlined />}>
                        {r.name?.[0]?.toUpperCase()}
                      </Avatar>
                      <span>{r.name || '(Đã xoá)'}</span>
                    </Space>
                  ),
                },
                { title: 'Phòng ban', dataIndex: 'department', key: 'department', render: (d) => d || '—' },
                {
                  title: 'Trạng thái',
                  key: 'status',
                  render: (_, r) =>
                    // "Đã khoá" = TÀI KHOẢN người nhận bị khoá (isActive=false,
                    // PLAN 7.7: "Người nhận đã khoá... không tính vào tỉ lệ"),
                    // khác `dismissed` (người nhận tự ẩn thông báo khỏi hộp thư
                    // của họ - vẫn tính đã đọc/chưa đọc bình thường).
                    !r.isActive ? (
                      <Tag color="default">Đã khoá</Tag>
                    ) : r.isRead ? (
                      <Tag color="green">Đã đọc</Tag>
                    ) : (
                      <Tag color="gold">Chưa đọc</Tag>
                    ),
                },
                {
                  title: 'Thời điểm đọc',
                  dataIndex: 'readAt',
                  key: 'readAt',
                  render: (v?: string | null) => (v ? dayjs(v).format('HH:mm DD/MM/YYYY') : '—'),
                },
              ]}
            />
            {recipients.hasNextPage && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <Button
                  size="small"
                  loading={recipients.isFetchingNextPage}
                  onClick={() => recipients.fetchNextPage()}
                >
                  Tải thêm
                </Button>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
