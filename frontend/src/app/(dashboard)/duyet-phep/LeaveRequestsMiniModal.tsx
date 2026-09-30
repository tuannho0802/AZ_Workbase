'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, DatePicker, Input, Modal, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { AttachmentsViewerButton } from '@/components/leave-requests/AttachmentsViewerButton';
import { useLeaveStatsRequests } from '@/lib/hooks/useLeaveStats';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { useDepartments } from '@/lib/hooks/useDepartments';
import type {
  LeaveDrill,
  LeaveDrillQuick,
  LeaveDrillStatus,
  LeaveStatsFilters,
  LeaveStatsRequestRow,
  LeaveStatsRequestsQuery,
} from '@/lib/types/leave-stats.types';
import type { ReportQuery } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { fmtCount } from '@/lib/utils/marketingReport';
import { LEAVE_STATUS_LABEL, WEEKDAY_LABEL, bucketLabel, fmtDays } from '@/lib/utils/leaveStats';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/** Tối đa 10 dòng/trang - cùng quy ước Mini Table khách hàng (ReportCustomersModal). */
const PAGE_SIZE = 10;

type QuickValue = 'all' | LeaveDrillStatus | LeaveDrillQuick;
const STATUS_TAG_COLOR = { approved: 'success', pending: 'processing', rejected: 'error' } as const;
const QUICK_OPTIONS: { value: QuickValue; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
  { value: 'supplementary', label: 'Đơn bổ sung' },
];

/** Nút Lọc nhanh theo NGỮ CẢNH: đã bấm vào 1 trạng thái (preset.status) thì bỏ 3 nút trạng thái (luôn trùng/rỗng). */
export function getLeaveQuickOptions(preset?: LeaveDrill['preset']) {
  return QUICK_OPTIONS.filter((o) => {
    if (o.value === 'supplementary') return preset?.quick !== 'supplementary';
    if (o.value === 'pending' || o.value === 'approved' || o.value === 'rejected') return preset?.status === undefined;
    return true;
  });
}

/** Mô tả ngắn phần "bucket/thứ" đang xem, hiện cạnh tiêu đề để người dùng biết mình đang xem lát cắt nào. */
export function describeLeaveDrill(preset: LeaveDrill['preset'], granularity: 'day' | 'month' = 'day'): string[] {
  const out: string[] = [];
  if (preset?.bucket) out.push(`${granularity === 'month' ? 'Tháng' : 'Ngày'} ${bucketLabel(preset.bucket, preset.bucket.length === 7 ? 'month' : 'day')}`);
  if (preset?.weekday) out.push(`Bắt đầu nghỉ ${WEEKDAY_LABEL[preset.weekday]}`);
  if (preset?.status) out.push(LEAVE_STATUS_LABEL[preset.status]);
  if (preset?.quick === 'supplementary') out.push('Đơn bổ sung');
  return out;
}

interface Props {
  drill: LeaveDrill | null;
  onClose: () => void;
  /** Kỳ đang xem ở tab Thống kê. */
  query: ReportQuery;
  /** Bộ lọc cấp tab (phòng ban / loại phép / nhân viên) - modal kế thừa để số dòng khớp con số được bấm. */
  baseFilters: LeaveStatsFilters;
  allowed: boolean;
}

/**
 * Mini Table ĐƠN NGHỈ PHÉP đứng sau Card/Chart của tab Thống kê (drill-down): xem nhanh đơn của 1 hoặc N nhân viên,
 * 1 trạng thái, 1 loại phép, 1 phòng ban, 1 thứ/ngày... Server-side phân trang (10/trang) + tìm kiếm + lọc riêng +
 * Lọc nhanh. Số dòng = ĐÚNG con số được bấm (BE dùng cùng cách chọn đơn với `GET /leave-requests/stats`). Chỉ xem.
 */
export default function LeaveRequestsMiniModal({ drill, onClose, query, baseFilters, allowed }: Props) {
  const open = !!drill;
  const preset = drill?.preset;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [leaveType, setLeaveType] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [quick, setQuick] = useState<QuickValue>('all');
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const { leaveTypes } = useLeaveTypes();
  const { departments } = useDepartments();

  // Mở modal (hoặc bấm chỗ khác) -> reset bộ lọc riêng. Làm ngay lúc render (mẫu "điều chỉnh state theo prop") để không
  // render thừa 1 lượt với bộ lọc cũ - cùng cách ReportCustomersModal.
  const [prevDrill, setPrevDrill] = useState(drill);
  if (drill !== prevDrill) {
    setPrevDrill(drill);
    if (drill) {
      setPage(1);
      setSearchInput('');
      setSearch('');
      setLeaveType(undefined);
      setDepartmentId(undefined);
      setQuick('all');
      setRange(null);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const quickOptions = getLeaveQuickOptions(preset);
  const effectiveQuick: QuickValue = quickOptions.some((o) => o.value === quick) ? quick : 'all';

  const params = useMemo<LeaveStatsRequestsQuery>(() => {
    const status = preset?.status ?? (effectiveQuick === 'pending' || effectiveQuick === 'approved' || effectiveQuick === 'rejected' ? effectiveQuick : undefined);
    const quickFlag = preset?.quick ?? (effectiveQuick === 'supplementary' ? 'supplementary' : undefined);
    return {
      ...baseFilters,
      // preset thắng ô lọc riêng; ô lọc riêng thắng bộ lọc cấp tab.
      departmentId: preset?.departmentId ?? departmentId ?? baseFilters.departmentId,
      leaveType: preset?.leaveType ?? leaveType ?? baseFilters.leaveType,
      status,
      quick: quickFlag,
      requesterIds: preset?.requesterIds?.length ? preset.requesterIds.join(',') : undefined,
      weekday: preset?.weekday,
      bucket: preset?.bucket,
      fromDate: range?.[0]?.format('YYYY-MM-DD'),
      toDate: range?.[1]?.format('YYYY-MM-DD'),
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
    };
  }, [baseFilters, preset, departmentId, leaveType, effectiveQuick, range, search, page]);

  const { data, isLoading, isFetching, isError, error } = useLeaveStatsRequests(query, params, open && allowed);

  const typeMeta = useMemo(() => new Map(leaveTypes.map((t) => [t.code, t])), [leaveTypes]);
  const deptColor = (id?: number) => departments.find((d) => d.id === id)?.color;

  const columns: ColumnsType<LeaveStatsRequestRow> = useMemo(
    () => [
      { title: 'STT', key: 'stt', width: 50, align: 'center', render: (_, __, i) => (page - 1) * PAGE_SIZE + i + 1 },
      {
        title: 'Nhân viên',
        key: 'requester',
        width: 200,
        render: (_, r) => (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <Text strong style={{ color: '#1890ff' }}>{r.requester?.name ?? '—'}</Text>
            {r.requester?.department && (
              <Tag color={resolveEntityColor(r.requester.department.color ?? deptColor(r.requester.department.id))} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>
                {r.requester.department.name}
              </Tag>
            )}
          </div>
        ),
      },
      {
        title: 'Loại phép',
        dataIndex: 'leaveType',
        key: 'leaveType',
        width: 130,
        render: (code: string) => {
          const t = typeMeta.get(code);
          return <Tag color={t?.color} style={{ marginInlineEnd: 0 }}>{t?.name ?? code}</Tag>;
        },
      },
      {
        title: 'Ngày nghỉ',
        key: 'dates',
        width: 180,
        render: (_, r) => {
          const from = dayjs(r.startDate).format('DD/MM/YYYY');
          const to = dayjs(r.endDate).format('DD/MM/YYYY');
          const hours = r.periodStartTime && r.periodEndTime ? `${r.periodStartTime.slice(0, 5)} - ${r.periodEndTime.slice(0, 5)}` : null;
          return (
            <div>
              <div>{from === to ? from : `${from} → ${to}`}</div>
              {hours && <Text type="secondary" style={{ fontSize: 12 }}>{hours}</Text>}
            </div>
          );
        },
      },
      { title: 'Số ngày', key: 'days', width: 80, align: 'right', render: (_, r) => <Text strong>{fmtDays(Number(r.totalDays))}</Text> },
      {
        title: 'Trạng thái',
        key: 'status',
        width: 120,
        render: (_, r) => {
          const st = r.status as keyof typeof STATUS_TAG_COLOR;
          return (
            <Space size={4} wrap>
              <Tag color={STATUS_TAG_COLOR[st]} style={{ marginInlineEnd: 0 }}>{LEAVE_STATUS_LABEL[st] ?? r.status}</Tag>
              {r.isSupplementary && (
                <Tooltip title="Đơn tạo bù: ngày nghỉ sớm hơn ngày tạo đơn.">
                  <Tag color="warning" style={{ marginInlineEnd: 0 }}>Bổ sung</Tag>
                </Tooltip>
              )}
            </Space>
          );
        },
      },
      {
        title: 'Lý do',
        dataIndex: 'reason',
        key: 'reason',
        width: 220,
        ellipsis: true,
        render: (v: string, r) => (
          <Tooltip title={<div style={{ whiteSpace: 'pre-wrap' }}>{v}{r.rejectionReason ? `\n— Từ chối: ${r.rejectionReason}` : ''}</div>}>
            <span>{v}</span>
          </Tooltip>
        ),
      },
      { title: 'Người duyệt', key: 'approver', width: 130, ellipsis: true, render: (_, r) => r.approver?.name ?? <Text type="secondary">—</Text> },
      {
        title: 'Ảnh',
        key: 'files',
        width: 80,
        align: 'center',
        fixed: 'right',
        render: (_, r) => <AttachmentsViewerButton requestId={r.id} size="small" count={r.attachmentCount} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, typeMeta, departments],
  );

  const tags = describeLeaveDrill(preset, data?.period.granularity);
  const title = drill ? `${drill.title}${drill.label ? ` — ${drill.label}` : ''}` : '';
  const period = data?.period;

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1180} destroyOnHidden title={title}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 220 }}
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="Tìm tên nhân viên, phòng ban..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {preset?.leaveType === undefined && (
          <Select
            allowClear
            style={{ width: 170 }}
            placeholder="Loại phép"
            value={leaveType}
            onChange={(v) => { setLeaveType(v); setPage(1); }}
            options={leaveTypes.map((t) => ({ value: t.code, label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag> }))}
          />
        )}
        {preset?.departmentId === undefined && baseFilters.departmentId === undefined && (
          <Select<number>
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: 180 }}
            placeholder="Phòng ban"
            value={departmentId}
            onChange={(v) => { setDepartmentId(v); setPage(1); }}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        )}
        <RangePicker
          format="DD/MM/YYYY"
          placeholder={['Nghỉ từ ngày', 'đến']}
          value={range}
          onChange={(v) => { setRange(v as typeof range); setPage(1); }}
        />
      </Space>
      <div style={{ marginBottom: 12 }}>
        <Segmented
          size="small"
          value={effectiveQuick}
          options={quickOptions}
          onChange={(v) => { setQuick(v as QuickValue); setPage(1); }}
        />
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
          {period ? `Kỳ: ${dayjs(period.from).format('DD/MM/YYYY')} → ${dayjs(period.to).format('DD/MM/YYYY')}` : ''}
        </Text>
        {tags.map((t) => <Tag key={t} style={{ marginLeft: 8 }}>{t}</Tag>)}
        {(preset?.requesterIds?.length ?? 0) > 1 && <Tag color="blue" style={{ marginLeft: 8 }}>{preset!.requesterIds!.length} nhân viên</Tag>}
      </div>

      {isError ? (
        <Alert type="error" showIcon title="Không tải được danh sách đơn nghỉ" description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')} />
      ) : (
        <Table<LeaveStatsRequestRow>
          size="small"
          rowKey="id"
          loading={isLoading || isFetching}
          columns={columns}
          dataSource={data?.data ?? []}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Không có đơn nghỉ phù hợp' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: (t) => `Tổng ${t} đơn`,
            onChange: (p) => setPage(p),
          }}
        />
      )}
      {!isError && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Tổng {fmtCount(data?.total ?? 0)} đơn · {fmtDays(data?.totalDays ?? 0)} ngày (mọi trang). Không tính đơn trong Thùng rác.
        </Text>
      )}
    </Modal>
  );
}
