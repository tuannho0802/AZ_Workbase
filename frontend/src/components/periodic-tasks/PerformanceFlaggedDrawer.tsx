'use client';

import { Drawer, Table, Tag, Typography, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useUserFlaggedTasks } from '@/lib/hooks/usePeriodicTaskPerformance';
import { LATE_GRACE_DAYS, type PerformanceFilterParams } from '@/lib/api/periodic-task-performance.api';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { classifyFlaggedTask } from '@/lib/utils/periodicTaskPerformance';
import { PeriodTypeTag } from './PeriodTypeTag';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Text } = Typography;

interface Props {
  /** `null` = đóng Drawer (và không fetch). */
  user: { id: number; name: string } | null;
  /** Cùng bộ lọc với bảng tổng hợp để số liệu drill-down khớp dòng đã bấm. */
  params: PerformanceFilterParams;
  onClose: () => void;
}

/** Drill-down từ 1 dòng bảng Hiệu suất: các Task hoàn thành muộn / quá hạn chưa xong của User đó. */
export function PerformanceFlaggedDrawer({ user, params, onClose }: Props) {
  const { data, isLoading, isError } = useUserFlaggedTasks(user?.id ?? null, params);

  const columns: ColumnsType<PeriodicTask> = [
    {
      title: 'Tình trạng',
      key: 'kind',
      width: 150,
      render: (_, t) =>
        classifyFlaggedTask(t) === 'late' ? (
          <Tag color="warning">Hoàn thành muộn</Tag>
        ) : (
          <Tag color="error">Quá hạn chưa xong</Tag>
        ),
    },
    {
      title: 'Công việc',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 240,
    },
    {
      title: 'Loại kỳ',
      dataIndex: 'periodType',
      key: 'periodType',
      width: 90,
      render: (v) => <PeriodTypeTag type={v} />,
    },
    {
      title: 'Kỳ hạn',
      key: 'period',
      width: 180,
      render: (_, t) =>
        t.periodStartDate === t.periodEndDate
          ? dayjs(t.periodEndDate).format('DD/MM/YYYY')
          : `${dayjs(t.periodStartDate).format('DD/MM')} - ${dayjs(t.periodEndDate).format('DD/MM/YYYY')}`,
    },
    {
      title: `Hạn chót (+${LATE_GRACE_DAYS} ngày)`,
      key: 'deadline',
      width: 160,
      render: (_, t) => dayjs(t.periodEndDate).add(LATE_GRACE_DAYS, 'day').format('DD/MM/YYYY'),
    },
    {
      title: 'Trạng thái hiện tại',
      key: 'status',
      width: 150,
      render: (_, t) => <Tag color={t.status?.color}>{t.status?.name ?? '—'}</Tag>,
    },
    {
      title: 'Phòng ban',
      key: 'department',
      width: 140,
      render: (_, t) =>
        t.department ? (
          <Tag color={resolveEntityColor(t.department.color)}>{t.department.name}</Tag>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      size="large"
      title={user ? `Công việc cần lưu ý — ${user.name}` : ''}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title={`Gồm Task hoàn thành sau kỳ hạn + ${LATE_GRACE_DAYS} ngày, và Task chưa chuyển In review/Hoàn thành dù đã qua mốc đó.`}
      />
      {isError ? (
        <Text type="danger">Không tải được danh sách. Vui lòng thử lại.</Text>
      ) : (
        <Table<PeriodicTask>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: 'Không có công việc nào trễ hạn trong khoảng đã chọn' }}
        />
      )}
    </Drawer>
  );
}
