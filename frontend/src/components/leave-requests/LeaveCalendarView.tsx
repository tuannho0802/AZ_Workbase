'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Calendar, Checkbox, Col, Empty, Modal, Row, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { LeaveCalendarItem } from '@/lib/api/leave-requests.api';
import { useLeaveCalendar, LeaveCalendarMode } from '@/lib/hooks/useLeaveCalendar';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import {
  LEAVE_CALENDAR_STATUS_LABELS,
  LeaveCalendarStatus,
  getCalendarFetchRange,
  indexLeavesByDate,
  leaveDurationLabel,
  leaveDurationSuffix,
  summarizeMonth,
} from '@/lib/utils/leaveCalendar';

const { Text } = Typography;
const MAX_PER_CELL = 3;

export interface LeaveCalendarViewProps {
  /** 'mine' = đơn CỦA MÌNH (/nghi-phep). 'scoped' = đơn người khác trong phạm vi xem (/duyet-phep). */
  mode: LeaveCalendarMode;
}

/**
 * Lịch tháng nghỉ phép - dùng NGUYÊN `Calendar` của antd, cùng kiểu với
 * `PeriodicTasksCalendarView`. Đơn nhiều ngày lặp lại ở MỖI ngày nó phủ. Tự tải dữ liệu
 * theo tháng đang xem (BE chỉ trả khoảng ngày của lưới, không tải hết).
 * Kiểu hiển thị: màu Tag = màu Loại phép; Chờ duyệt = viền nét đứt + mờ; Từ chối = gạch ngang.
 */
export function LeaveCalendarView({ mode }: LeaveCalendarViewProps) {
  const scoped = mode === 'scoped';
  const [month, setMonth] = useState<Dayjs>(() => dayjs());
  const [statuses, setStatuses] = useState<LeaveCalendarStatus[]>(['pending', 'approved']);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [leaveType, setLeaveType] = useState<string | null>(null);
  const [dayModal, setDayModal] = useState<Dayjs | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { leaveTypes } = useLeaveTypes();
  const { departments } = useDepartments();
  const leaveTypeMap = useMemo(() => Object.fromEntries(leaveTypes.map((t) => [t.code, t])), [leaveTypes]);

  const range = useMemo(() => getCalendarFetchRange(month), [month.year(), month.month()]); // eslint-disable-line react-hooks/exhaustive-deps
  const { items, isFetching } = useLeaveCalendar(mode, {
    ...range,
    ...(scoped && departmentId ? { departmentId } : {}),
    ...(leaveType ? { leaveType } : {}),
  });

  const visible = useMemo(() => items.filter((it) => statuses.includes(it.status)), [items, statuses]);
  const byDate = useMemo(() => indexLeavesByDate(visible), [visible]);
  const summary = useMemo(() => summarizeMonth(visible, month), [visible, month]);

  const typeName = (it: LeaveCalendarItem) => leaveTypeMap[it.leaveType]?.name ?? it.leaveType;
  const typeColor = (it: LeaveCalendarItem) => resolveEntityColor(leaveTypeMap[it.leaveType]?.color);
  const label = (it: LeaveCalendarItem) => `${scoped ? (it.requester?.name ?? '—') : typeName(it)}${leaveDurationSuffix(it.duration)}`;

  const detail = (it: LeaveCalendarItem) => (
    <div style={{ maxWidth: 260 }}>
      {scoped && <div style={{ fontWeight: 600 }}>{it.requester?.name ?? '—'}{it.requester?.department ? ` · ${it.requester.department.name}` : ''}</div>}
      <div>{typeName(it)} · {LEAVE_CALENDAR_STATUS_LABELS[it.status].text}</div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        {dayjs(String(it.startDate).slice(0, 10)).format('DD/MM/YYYY')}
        {String(it.startDate).slice(0, 10) !== String(it.endDate).slice(0, 10) && ` → ${dayjs(String(it.endDate).slice(0, 10)).format('DD/MM/YYYY')}`}
        {' · '}{leaveDurationLabel(it)} · {it.totalDays} ngày
      </div>
      {it.isSupplementary && <div style={{ fontSize: 12, opacity: 0.85 }}>Đơn bổ sung</div>}
      {it.reason && <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Lý do:</strong> {it.reason}</div>}
    </div>
  );

  const pill = (it: LeaveCalendarItem) => (
    <Tooltip key={it.id} title={detail(it)}>
      <Tag
        color={typeColor(it)}
        variant={it.status === 'pending' ? 'outlined' : undefined}
        style={{
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          borderRadius: 4,
          fontWeight: 500,
          opacity: it.status === 'pending' ? 0.75 : it.status === 'rejected' ? 0.55 : 1,
          textDecoration: it.status === 'rejected' ? 'line-through' : undefined,
          borderStyle: it.status === 'pending' ? 'dashed' : undefined,
        }}
      >
        {label(it)}
      </Tag>
    </Tooltip>
  );

  const cellRender = (date: Dayjs) => {
    const day = byDate.get(date.format('YYYY-MM-DD')) ?? [];
    if (day.length === 0) return null;
    if (isMobile) return <Badge count={day.length} size="small" color="#1677ff" />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {day.slice(0, MAX_PER_CELL).map(pill)}
        {day.length > MAX_PER_CELL && <Text type="secondary" style={{ fontSize: 12 }}>+{day.length - MAX_PER_CELL} đơn nữa</Text>}
      </div>
    );
  };

  const dayItems = dayModal ? (byDate.get(dayModal.format('YYYY-MM-DD')) ?? []) : [];

  return (
    <div>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
        <Col xs={24} md={scoped ? 10 : 24}>
          <Checkbox.Group
            value={statuses}
            onChange={(v) => setStatuses(v as LeaveCalendarStatus[])}
            options={(Object.keys(LEAVE_CALENDAR_STATUS_LABELS) as LeaveCalendarStatus[]).map((s) => ({
              value: s,
              label: <Tag color={LEAVE_CALENDAR_STATUS_LABELS[s].color} style={{ marginInlineEnd: 0 }}>{LEAVE_CALENDAR_STATUS_LABELS[s].text}</Tag>,
            }))}
          />
        </Col>
        {scoped && (
          <>
            <Col xs={12} md={7}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={departmentId}
                onChange={(v) => setDepartmentId(v ?? null)}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Col>
            <Col xs={12} md={7}>
              <Select
                allowClear
                placeholder="Loại phép"
                style={{ width: '100%' }}
                value={leaveType}
                onChange={(v) => setLeaveType(v ?? null)}
                options={leaveTypes.map((t) => ({ value: t.code, label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag> }))}
              />
            </Col>
          </>
        )}
      </Row>

      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        Tháng {month.format('MM/YYYY')}: <strong>{summary.requests}</strong> đơn{scoped ? <> · <strong>{summary.people}</strong> người nghỉ</> : null}.
        {' '}Màu = Loại phép; viền nét đứt = chờ duyệt; gạch ngang = bị từ chối. Bấm vào 1 ngày để xem đầy đủ.
      </Text>

      <Spin spinning={isFetching}>
        <Calendar
          value={month}
          onPanelChange={(d) => setMonth(d)}
          onSelect={(d, info) => {
            if (info.source !== 'date') return;
            setMonth(d);
            if ((byDate.get(d.format('YYYY-MM-DD')) ?? []).length > 0) setDayModal(d);
          }}
          cellRender={(date, info) => (info.type === 'date' ? cellRender(date) : info.originNode)}
        />
      </Spin>

      <Modal
        open={!!dayModal}
        onCancel={() => setDayModal(null)}
        footer={null}
        title={dayModal ? `Ngày ${dayModal.format('DD/MM/YYYY')} - ${dayItems.length} đơn nghỉ` : ''}
        width={560}
      >
        {dayItems.length === 0 ? (
          <Empty description="Không có đơn nghỉ" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dayItems.map((it) => (
              <div key={it.id} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {scoped && <strong>{it.requester?.name ?? '—'}</strong>}
                  <Tag color={typeColor(it)} style={{ marginInlineEnd: 0 }}>{typeName(it)}</Tag>
                  <Tag color={LEAVE_CALENDAR_STATUS_LABELS[it.status].color} style={{ marginInlineEnd: 0 }}>{LEAVE_CALENDAR_STATUS_LABELS[it.status].text}</Tag>
                  {scoped && it.requester?.department && <Text type="secondary">{it.requester.department.name}</Text>}
                </div>
                {detail(it)}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
