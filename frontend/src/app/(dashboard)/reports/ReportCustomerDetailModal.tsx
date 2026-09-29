'use client';

import { UtmTag } from '@/components/utms/UtmTag';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Card, Col, Descriptions, Empty, Grid, Modal, Row, Skeleton, Space, Statistic, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DatePicker } from 'antd';
import { useReportCustomerDetail } from '@/lib/hooks/useReports';
import { SourceTag } from '@/components/customers/SourceTag';
import { StatusTag } from '@/components/customers/StatusTag';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { formatUsd } from '@/lib/utils/marketingReport';
import { buildCustomerTimeline, DEPOSIT_STAGE_LABEL, filterDepositsByRange } from '@/lib/utils/reportCustomerDetail';
import type { ReportCareNote, ReportContext, ReportDepositStage, ReportListUser } from '@/lib/types/reports.types';
import ReportUserName from './ReportUserName';
import ReportQuickRangeFilter, { type QuickRangeValue } from './ReportQuickRangeFilter';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface Props {
  customerId: number | null;
  context: ReportContext;
  onClose: () => void;
}

const NOTE_TYPE_LABEL: Record<string, string> = {
  general: 'Chung',
  call: 'Cuộc gọi',
  meeting: 'Cuộc họp',
  follow_up: 'Theo dõi',
};

const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');
const userCell = (u: ReportListUser | null) =>
  u ? <ReportUserName name={u.name} departmentName={u.departmentName} departmentColor={u.departmentColor} /> : <Text type="secondary">Chưa có</Text>;

const TIMELINE_COLOR: Record<string, string> = {
  created: 'gray',
  assigned: 'blue',
  joined: 'purple',
  closed: 'green',
  ftd: 'gold',
  redeposit: 'orange',
};

/**
 * Modal CHỈ XEM chi tiết 1 khách, mở từ cột "Thông tin" của Mini Table báo cáo (thay cho việc mở Drawer ở trang
 * Khách hàng). Gồm: thông tin chung, LỊCH SỬ NẠP chia giai đoạn (nạp đầu / nạp lại, luỹ kế, khoảng cách ngày) có lọc nhanh
 * theo ngày, nhóm đã join và dòng thời gian toàn vòng đời. Dữ liệu qua `/reports/customer-detail/:id` (cùng phạm vi quyền
 * với tab đang xem).
 */
export default function ReportCustomerDetailModal({ customerId, context, onClose }: Props) {
  const open = customerId != null;
  const { data, isLoading, isError, error } = useReportCustomerDetail(customerId, context);
  const [range, setRange] = useState<QuickRangeValue>(null);
  // Descriptions không nhận `column` responsive khi item có `span` cố định (span > column ở màn hẹp ->
  // warning "Sum of column span not match column") - tự tính SỐ CỘT hiện tại qua breakpoint, dùng làm
  // `column` (number, không phải object) VÀ `span` của 2 item "full width" (Nhóm đã join/Ghi chú) -> luôn khớp.
  const screens = Grid.useBreakpoint();
  const infoColumn = screens.sm ? 2 : 1;

  // Đổi sang khách khác -> bỏ lọc ngày cũ (điều chỉnh state theo prop ngay lúc render, không dùng effect).
  const [prevId, setPrevId] = useState(customerId);
  if (customerId !== prevId) {
    setPrevId(customerId);
    setRange(null);
  }

  const deposits = useMemo(() => filterDepositsByRange(data?.deposits ?? [], range), [data?.deposits, range]);
  const filteredTotal = useMemo(() => deposits.reduce((s, d) => s + d.amount, 0), [deposits]);
  const timeline = useMemo(() => (data ? buildCustomerTimeline(data) : []), [data]);

  const depositColumns: ColumnsType<ReportDepositStage> = [
    { title: '#', dataIndex: 'order', key: 'order', width: 46, align: 'center' },
    {
      title: 'Giai đoạn',
      key: 'stage',
      width: 150,
      render: (_, d) => <Tag color={d.stage === 'ftd' ? 'gold' : 'blue'}>{DEPOSIT_STAGE_LABEL(d)}</Tag>,
    },
    { title: 'Ngày nạp', dataIndex: 'depositDate', key: 'date', width: 105, render: (v: string) => fmtDate(v) },
    {
      title: 'Cách lần trước',
      dataIndex: 'daysSincePrevious',
      key: 'gap',
      width: 115,
      render: (v: number | null) => (v == null ? '—' : v === 0 ? 'Cùng ngày' : `${v} ngày`),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      width: 115,
      align: 'right',
      render: (v: number) => <Text strong style={{ color: '#389e0d' }}>{formatUsd(v)}</Text>,
    },
    { title: 'Luỹ kế', dataIndex: 'cumulative', key: 'cum', width: 115, align: 'right', render: (v: number) => formatUsd(v) },
    { title: 'Broker', dataIndex: 'broker', key: 'broker', width: 100, render: (v: string | null) => v || '—' },
    { title: 'Người nhập', key: 'by', width: 130, render: (_, d) => d.createdBy?.name ?? '—' },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note', ellipsis: true, render: (v: string | null) => v || '—' },
  ];

  const c = data?.customer;
  const s = data?.depositSummary;

  const infoTab = c && (
    <Descriptions size="small" bordered column={infoColumn} styles={{ label: { width: 150 } }}>
      <Descriptions.Item label="Họ và tên">{c.name}</Descriptions.Item>
      <Descriptions.Item label="Trạng thái"><StatusTag code={c.status} fallback="—" /></Descriptions.Item>
      <Descriptions.Item label="SĐT">{c.phone || <Text type="secondary" italic>Chưa có SĐT</Text>}</Descriptions.Item>
      <Descriptions.Item label="Email">{c.email || <Text type="secondary" italic>Chưa có email</Text>}</Descriptions.Item>
      <Descriptions.Item label="Nguồn"><SourceTag source={c.source} /></Descriptions.Item>
      <Descriptions.Item label="UTM">
        {c.utm ? <UtmTag name={c.utm.name} color={c.utm.color} /> : c.campaign || '—'}
      </Descriptions.Item>
      <Descriptions.Item label="Sales chính">{userCell(c.salesUser)}</Descriptions.Item>
      <Descriptions.Item label="Marketing phụ trách">{c.marketingUser ? userCell(c.marketingUser) : <Tag>Chưa gán</Tag>}</Descriptions.Item>
      <Descriptions.Item label="Người tạo">{userCell(c.createdBy)}</Descriptions.Item>
      <Descriptions.Item label="Broker">{c.broker || '—'}</Descriptions.Item>
      <Descriptions.Item label="Ngày nhập">{fmtDate(c.inputDate)}</Descriptions.Item>
      <Descriptions.Item label="Ngày gán Sales">{fmtDate(c.assignedDate)}</Descriptions.Item>
      <Descriptions.Item label="Ngày chốt">{fmtDate(c.closedDate)}</Descriptions.Item>
      <Descriptions.Item label="Tạo lúc">{dayjs(c.createdAt).format('HH:mm DD/MM/YYYY')}</Descriptions.Item>
      <Descriptions.Item label="Nhóm đã join" span={infoColumn}>
        {data?.groups.length ? data.groups.map((g) => <Tag key={g.id}>{g.name}{g.joinedAt ? ` · ${dayjs(g.joinedAt).format('DD/MM/YYYY')}` : ''}</Tag>) : '—'}
      </Descriptions.Item>
    </Descriptions>
  );

  const depositTab = data && (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Statistic title="Tổng nạp" value={s?.totalAmount ?? 0} formatter={(v) => formatUsd(Number(v))} styles={{ content: { color: '#389e0d', fontSize: 20 } }} /></Col>
        <Col xs={12} md={6}><Statistic title="Số lần nạp" value={s?.depositCount ?? 0} styles={{ content: { fontSize: 20 } }} /></Col>
        <Col xs={12} md={6}><Statistic title="TB / lần" value={s?.averageAmount ?? 0} formatter={(v) => formatUsd(Number(v))} styles={{ content: { fontSize: 20 } }} /></Col>
        <Col xs={12} md={6}><Statistic title="Lớn nhất" value={s?.maxAmount ?? 0} formatter={(v) => formatUsd(Number(v))} styles={{ content: { fontSize: 20 } }} /></Col>
      </Row>
      {s && s.depositCount > 0 && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          Nạp đầu {fmtDate(s.firstDepositDate)}
          {s.daysToFirstDeposit != null ? ` (sau ${s.daysToFirstDeposit} ngày kể từ ngày nhập)` : ''} · gần nhất {fmtDate(s.lastDepositDate)}
          {s.depositSpanDays ? ` · trải dài ${s.depositSpanDays} ngày` : ''}
        </Text>
      )}
      <Space wrap style={{ marginBottom: 8 }}>
        <ReportQuickRangeFilter value={range} onChange={setRange} />
        <RangePicker
          size="small"
          format="DD/MM/YYYY"
          placeholder={['Từ ngày', 'đến']}
          value={range}
          onChange={(v) => setRange(v as QuickRangeValue)}
        />
        {range?.[0] && range?.[1] && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {deposits.length} khoản · {formatUsd(filteredTotal)} trong khoảng đã chọn
          </Text>
        )}
      </Space>
      <Table<ReportDepositStage>
        size="small"
        rowKey="id"
        columns={depositColumns}
        dataSource={deposits}
        pagination={false}
        scroll={{ x: 'max-content', y: 320 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.deposits.length ? 'Không có khoản nạp trong khoảng này' : 'Khách chưa nạp lần nào'} /> }}
      />
    </div>
  );

  // Ghi chú chia 2 loại: GHI CHÚ CHUNG (cột `note` của bảng customers) và GHI CHÚ CHĂM SÓC (bảng customer_notes,
  // giống tab Ghi chú ở Drawer chi tiết khách - ở đây chỉ xem).
  const careNotes: ReportCareNote[] = data?.careNotes ?? [];
  const notesTab = (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Card size="small" title="Ghi chú chung">
        {c?.note ? <span style={{ whiteSpace: 'pre-wrap' }}>{c.note}</span> : <Text type="secondary">Chưa có ghi chú chung</Text>}
      </Card>
      <Card size="small" title={`Ghi chú chăm sóc (${careNotes.length})`}>
        {careNotes.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ghi chú chăm sóc" />
        ) : (
          careNotes.map((n) => (
            <div
              key={n.id}
              style={{ padding: 12, borderBottom: '1px solid #f0f0f0', background: n.isImportant ? '#fff1f0' : undefined, borderRadius: n.isImportant ? 4 : 0 }}
            >
              <Space size={8} wrap style={{ marginBottom: 4 }}>
                <Text strong>{n.createdBy?.name ?? 'Hệ thống'}</Text>
                <Tag color={n.isImportant ? 'error' : 'default'}>{NOTE_TYPE_LABEL[n.noteType] ?? n.noteType}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(n.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
              </Space>
              <div style={{ whiteSpace: 'pre-wrap', color: '#262626' }}>{n.note}</div>
            </div>
          ))
        )}
      </Card>
    </Space>
  );

  const timelineTab = (
    <Timeline
      style={{ marginTop: 8 }}
      items={timeline.map((e) => ({
        key: e.key,
        color: TIMELINE_COLOR[e.kind],
        content: (
          <span>
            <Text strong>{fmtDate(e.date)}</Text> — {e.title}
            {e.detail && <Text type="secondary"> · {e.detail}</Text>}
          </span>
        ),
      }))}
    />
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnHidden
      title={c ? `Thông tin khách — ${c.name}` : 'Thông tin khách'}
    >
      {isError ? (
        <Alert type="error" showIcon message="Không tải được thông tin khách" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      ) : isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Tabs
          defaultActiveKey="info"
          items={[
            { key: 'info', label: 'Thông tin chung', children: infoTab },
            { key: 'deposits', label: `Lịch sử nạp (${data.deposits.length})`, children: depositTab },
            { key: 'notes', label: `Ghi chú (${careNotes.length + (c?.note ? 1 : 0)})`, children: notesTab },
            { key: 'timeline', label: 'Dòng thời gian', children: timelineTab },
          ]}
        />
      )}
    </Modal>
  );
}