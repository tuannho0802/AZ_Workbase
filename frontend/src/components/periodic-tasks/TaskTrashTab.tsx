'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { periodicTaskTrashApi, TrashedPeriodicTask } from '@/lib/api/periodic-task-trash.api';
import { PERIOD_TYPE_LABELS } from '@/lib/api/periodic-tasks.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { useDebounce } from '@/lib/hooks/useDebounce';

const { Text } = Typography;

const CONFIRM_PHRASE = 'XOA VINH VIEN';
const TRASH_KEY = ['periodic-tasks-trash'];

/**
 * Tab "Thùng rác" của Công việc định kỳ - gate bằng `periodic_tasks.trash_manage`
 * (trang cha chỉ render khi có quyền; BE vẫn là chốt chặn thật). Chỉ có 2 hành
 * động, đều KHÔNG thể hoàn tác: xoá vĩnh viễn các Task đã chọn, và dọn sạch cả
 * thùng rác (bắt gõ cụm xác nhận để tránh bấm nhầm).
 */
export function TaskTrashTab() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [phrase, setPhrase] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...TRASH_KEY, page, limit, search],
    queryFn: () => periodicTaskTrashApi.getTrash({ page, limit, search: search || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const afterDelete = () => {
    setSelectedIds([]);
    queryClient.invalidateQueries({ queryKey: TRASH_KEY });
  };

  const hardDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => periodicTaskTrashApi.hardDelete(ids),
    onSuccess: (res) => {
      message.success(`Đã xoá vĩnh viễn ${res.deleted} Công việc`);
      afterDelete();
    },
    onError: (err) => message.error(getApiErrorMessage(err, 'Không thể xoá vĩnh viễn')),
  });

  const emptyMutation = useMutation({
    mutationFn: () => periodicTaskTrashApi.emptyTrash(),
    onSuccess: (res) => {
      message.success(`Đã dọn sạch thùng rác (${res.deleted} Công việc)`);
      setEmptyOpen(false);
      setPhrase('');
      setPage(1);
      afterDelete();
    },
    onError: (err) => message.error(getApiErrorMessage(err, 'Không thể dọn sạch thùng rác')),
  });

  const confirmHardDelete = () => {
    modal.confirm({
      title: `Xoá vĩnh viễn ${selectedIds.length} Công việc đã chọn?`,
      icon: <ExclamationCircleOutlined />,
      content: 'Checklist, liên kết, khách hàng gắn kèm và lịch sử của các Công việc này cũng bị xoá theo. KHÔNG thể khôi phục.',
      okText: 'Xoá vĩnh viễn',
      okButtonProps: { danger: true },
      cancelText: 'Hủy',
      onOk: () => hardDeleteMutation.mutateAsync(selectedIds),
    });
  };

  const columns: ColumnsType<TrashedPeriodicTask> = [
    {
      title: 'Công việc',
      key: 'title',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{r.title}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {PERIOD_TYPE_LABELS[r.periodType]} · {dayjs(r.periodStartDate).format('DD/MM/YYYY')}
            {r.periodStartDate !== r.periodEndDate && ` → ${dayjs(r.periodEndDate).format('DD/MM/YYYY')}`}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Phụ trách chính',
      key: 'primaryAssignee',
      width: 160,
      render: (_, r) => r.primaryAssignee?.name ?? '—',
    },
    {
      title: 'Phòng ban',
      key: 'department',
      width: 140,
      render: (_, r) =>
        r.department ? <Tag color={resolveEntityColor(r.department.color)}>{r.department.name}</Tag> : '—',
    },
    {
      title: 'Người tạo',
      key: 'createdBy',
      width: 150,
      render: (_, r) => r.createdBy?.name ?? '—',
    },
    {
      title: 'Người xoá',
      key: 'deletedBy',
      width: 150,
      render: (_, r) => r.deletedBy?.name ?? '—',
    },
    {
      title: 'Ngày xoá',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: 150,
      render: (v: string) => dayjs(v).format('HH:mm DD/MM/YYYY'),
    },
  ];

  return (
    <div>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="Thùng rác chứa các Công việc đã xoá mềm. Xoá vĩnh viễn KHÔNG thể khôi phục và xoá luôn checklist, liên kết, khách hàng gắn kèm và lịch sử của Công việc đó."
      />

      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="Tìm theo tiêu đề..."
          style={{ width: 280 }}
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
        <Button
          danger
          icon={<DeleteOutlined />}
          disabled={selectedIds.length === 0}
          loading={hardDeleteMutation.isPending}
          onClick={confirmHardDelete}
        >
          Xoá vĩnh viễn đã chọn ({selectedIds.length})
        </Button>
        <Button danger type="primary" icon={<DeleteOutlined />} disabled={total === 0} onClick={() => setEmptyOpen(true)}>
          Dọn sạch thùng rác ({total})
        </Button>
      </Space>

      <Table<TrashedPeriodicTask>
        rowKey="id"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 900 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
        locale={{ emptyText: 'Thùng rác trống' }}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          showTotal: (t) => `Tổng ${t} Công việc`,
          onChange: (p, ps) => {
            setPage(p);
            setLimit(ps);
          },
        }}
      />

      <Modal
        open={emptyOpen}
        title="Dọn sạch thùng rác?"
        okText="Xoá vĩnh viễn tất cả"
        okButtonProps={{ danger: true, disabled: phrase !== CONFIRM_PHRASE }}
        cancelText="Hủy"
        confirmLoading={emptyMutation.isPending}
        onOk={() => emptyMutation.mutate()}
        onCancel={() => {
          setEmptyOpen(false);
          setPhrase('');
        }}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Text>
            Toàn bộ <Text strong>{total}</Text> Công việc trong thùng rác (kể cả các trang khác) sẽ bị xoá vĩnh viễn, không thể khôi phục.
          </Text>
          <Text>
            Gõ <Text code>{CONFIRM_PHRASE}</Text> để xác nhận:
          </Text>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={CONFIRM_PHRASE} />
        </Space>
      </Modal>
    </div>
  );
}
