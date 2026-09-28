'use client';

import { useState } from 'react';
import { Empty, Modal, Progress, Space, Table, Tag, Typography } from 'antd';
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMetricTasks } from '@/lib/hooks/usePeriodicTaskPerformance';
import type { MetricTaskRow, MetricVerdict, PerformanceFilterParams, PerformanceMetric } from '@/lib/api/periodic-task-performance.api';
import { PeriodTypeTag } from './PeriodTypeTag';
import { TaskAssignees } from './TaskAssignees';

const { Text } = Typography;

const VERDICT_TAG: Record<MetricVerdict, { color: string; text: string }> = {
  on_time: { color: 'success', text: 'Đúng hạn' },
  late: { color: 'warning', text: 'Xong muộn' },
  overdue: { color: 'error', text: 'Quá hạn chưa xong' },
  pending: { color: 'default', text: 'Đang trong hạn' },
};

const CHECKLIST_METRICS: PerformanceMetric[] = ['checklist_primary', 'checklist_secondary'];

interface Props {
  /** `null` = đóng Modal (không fetch). */
  metric: { key: PerformanceMetric; title: string } | null;
  /** Ngữ cảnh đang xem, VD "Toàn bộ · 12 nhân viên" - hiện dưới tiêu đề để biết bảng thuộc ai. */
  contextLabel: string;
  params: Omit<PerformanceFilterParams, 'primaryPage' | 'secondaryPage'>;
  userIds?: number[];
  onClose: () => void;
}

/**
 * MetricTasksModal - mini table hiện đúng tập Task đứng sau 1 Card ở trang Hiệu
 * suất (yêu cầu chủ dự án 2026-09-28): click Card -> xem nhanh Task + checklist
 * mà không phải mở Drawer từng người. Cùng bộ lọc/scope với Card (BE
 * `GET /periodic-tasks-performance/metric-tasks`), phân trang server-side.
 * Card Checklist mở sẵn mọi dòng; các Card khác bấm mũi tên để xem checklist.
 */
export function MetricTasksModal({ metric, contextLabel, params, userIds, onClose }: Props) {
  return (
    <Modal
      open={!!metric}
      onCancel={onClose}
      footer={null}
      width={980}
      destroyOnHidden
      title={
        metric ? (
          <Space orientation="vertical" size={0}>
            <span>{metric.title}</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{contextLabel}</Text>
          </Space>
        ) : null
      }
    >
      {/* key theo metric -> mở Card khác remount, tự về trang 1 + reset trạng thái mở rộng (không cần effect). */}
      {metric && <Body key={metric.key} metricKey={metric.key} params={params} userIds={userIds} />}
    </Modal>
  );
}

function Body({ metricKey, params, userIds }: { metricKey: PerformanceMetric; params: Props['params']; userIds?: number[] }) {
  const [page, setPage] = useState(1);
  // Task đã bị người dùng bấm đổi trạng thái mở rộng. Card Checklist mặc định MỞ hết nên
  // `toggled` ở đó nghĩa là "đã đóng"; Card khác mặc định ĐÓNG nên `toggled` là "đã mở".
  const [toggled, setToggled] = useState<Set<number>>(new Set());
  const isChecklist = CHECKLIST_METRICS.includes(metricKey);

  const { data, isLoading, isError } = useMetricTasks({ ...params, metric: metricKey, userIds, page }, true);
  const items = data?.items ?? [];

  const isExpanded = (id: number) => (isChecklist ? !toggled.has(id) : toggled.has(id));
  const flip = (id: number) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: ColumnsType<MetricTaskRow> = [
    {
      title: 'Task',
      key: 'title',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{r.task.title}</Text>
          {r.task.department?.name && <Text type="secondary" style={{ fontSize: 12 }}>{r.task.department.name}</Text>}
        </Space>
      ),
    },
    { title: 'Loại kỳ', key: 'periodType', width: 90, render: (_, r) => <PeriodTypeTag type={r.task.periodType} style={{ marginInlineEnd: 0 }} /> },
    {
      title: 'Kỳ hạn',
      key: 'period',
      width: 150,
      render: (_, r) => {
        const from = dayjs(r.task.periodStartDate).format('DD/MM');
        const to = dayjs(r.task.periodEndDate).format('DD/MM/YYYY');
        return r.task.periodStartDate === r.task.periodEndDate ? to : `${from} – ${to}`;
      },
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, r) => <Tag color={r.task.status?.color} style={{ marginInlineEnd: 0 }}>{r.task.status?.name ?? '—'}</Tag>,
    },
    {
      title: 'Tình trạng',
      key: 'verdict',
      width: 150,
      render: (_, r) => (r.verdict ? <Tag color={VERDICT_TAG[r.verdict].color} style={{ marginInlineEnd: 0 }}>{VERDICT_TAG[r.verdict].text}</Tag> : <Text type="secondary">—</Text>),
    },
    { title: 'Phụ trách', key: 'assignees', width: 170, render: (_, r) => <TaskAssignees task={r.task} /> },
    {
      title: 'Checklist',
      key: 'checklist',
      width: 130,
      render: (_, r) =>
        r.checklistTotal === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space size={6}>
            <Text>{r.checklistDone}/{r.checklistTotal}</Text>
            <Progress percent={Math.round((r.checklistDone / r.checklistTotal) * 100)} size="small" showInfo={false} style={{ width: 44, margin: 0 }} />
          </Space>
        ),
    },
  ];

  return (
    <Table<MetricTaskRow>
      rowKey={(r) => r.task.id}
      size="small"
      loading={isLoading}
      columns={columns}
      dataSource={items}
      scroll={{ x: 900 }}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isError ? 'Không tải được danh sách Task' : 'Không có Task nào'} />,
      }}
      pagination={{
        current: page,
        pageSize: data?.pageSize ?? 10,
        total: data?.total ?? 0,
        showSizeChanger: false,
        hideOnSinglePage: true,
        showTotal: (t) => `${t} Task`,
        onChange: (p) => {
          setPage(p);
          setToggled(new Set());
        },
      }}
      expandable={{
        expandedRowKeys: items.filter((r) => isExpanded(r.task.id)).map((r) => r.task.id),
        onExpand: (_, r) => flip(r.task.id),
        rowExpandable: (r) => r.checklistTotal > 0,
        expandedRowRender: (r) => (
          <div style={{ padding: '2px 8px' }}>
            {r.checklistItems.map((it) => (
              <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '2px 0' }}>
                {it.isDone ? <CheckCircleFilled style={{ color: '#52c41a', marginTop: 4 }} /> : <MinusCircleOutlined style={{ color: '#bfbfbf', marginTop: 4 }} />}
                <Text delete={it.isDone} type={it.isDone ? 'secondary' : undefined} style={{ whiteSpace: 'pre-wrap' }}>{it.content}</Text>
              </div>
            ))}
          </div>
        ),
      }}
    />
  );
}
