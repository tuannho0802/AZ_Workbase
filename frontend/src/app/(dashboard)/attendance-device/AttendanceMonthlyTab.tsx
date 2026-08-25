'use client';

import { useMemo, useState } from 'react';
import { Table, DatePicker, Select, Space, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { useAttendanceSummary } from '@/lib/hooks/useZkDevice';
import { useUsersList } from '@/lib/hooks/useUsers';
import { leaveRequestsApi } from '@/lib/api/leave-requests.api';

const { Text } = Typography;

// dayjs().day(): 0 = Chủ nhật ... 6 = Thứ bảy
const WEEKDAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Các ký hiệu đánh dấu trong ô lịch, cùng màu hiển thị tương ứng
type DayMark = 'X' | 'X/2' | '1/2K' | 'P' | 'KL';
const MARK_LABEL: Record<DayMark, string> = {
  X: 'Đi làm',
  'X/2': 'Nghỉ nửa ngày (hưởng lương)',
  '1/2K': 'Nghỉ nửa ngày (không lương)',
  P: 'Nghỉ phép (hưởng lương)',
  KL: 'Nghỉ không lương (cả ngày)',
};
const MARK_COLOR: Record<DayMark, string> = {
  X: '#1677ff',
  'X/2': '#d48806',
  '1/2K': '#d4380d',
  P: '#08979c',
  KL: '#cf1322',
};

interface EmployeeMonthRow {
  userId: number;
  userName: string;
  departmentName: string;
  annualLeaveBalance: number | null;
  days: Partial<Record<number, DayMark>>;
  actualWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
}

export default function AttendanceMonthlyTab() {
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const { users, isLoading: usersLoading } = useUsersList();

  const monthStart = month.startOf('month');
  const monthEnd = month.endOf('month');
  const daysInMonth = monthEnd.date();
  const fromStr = monthStart.format('YYYY-MM-DD');
  const toStr = monthEnd.format('YYYY-MM-DD');

  // Ngày công chuẩn: quy ước tuần làm 6 ngày (Thứ 2 - Thứ 7), nghỉ Chủ nhật.
  // Hiển thị 1 số chung cho cả bảng, giống hệt bảng mẫu (không tách theo
  // từng nhân viên) - nếu công ty có lịch làm khác, đây là nơi cần chỉnh.
  const standardWorkDays = useMemo(() => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (monthStart.date(d).day() !== 0) count++;
    }
    return count;
  }, [monthStart, daysInMonth]);

  // Lấy toàn bộ log chấm công đã tổng hợp theo ngày trong tháng đang xem,
  // limit đặt cao (đủ cho ~30 ngày x toàn bộ nhân viên) vì cần dựng ma
  // trận cho nhiều người cùng lúc, không phân trang như tab "Bảng chấm công".
  const { data: attendanceData, isLoading: attendanceLoading } = useAttendanceSummary({
    page: 1,
    limit: 3000,
    userId,
    from: fromStr,
    to: toStr,
  });

  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ['leave-approved-range', fromStr, toStr],
    queryFn: () => leaveRequestsApi.getApprovedInRange(fromStr, toStr),
  });

  const rows: EmployeeMonthRow[] = useMemo(() => {
    const employeeList = (users || []).filter((u: any) => !userId || u.id === userId);

    const map = new Map<number, EmployeeMonthRow>();
    for (const u of employeeList) {
      map.set(u.id, {
        userId: u.id,
        userName: u.name,
        departmentName: u.department?.name || '—',
        annualLeaveBalance: u.annualLeaveBalance ?? null,
        days: {},
        actualWorkDays: standardWorkDays,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
      });
    }

    // Đánh dấu 'X' từ dữ liệu chấm công thật - chỉ mang tính hiển thị trực
    // quan (đi làm ngày nào), KHÔNG dùng để tính cột "Ngày công thực tế"
    // (cột đó tính bằng Ngày công chuẩn trừ đi ngày nghỉ, xem bên dưới).
    for (const r of attendanceData?.data || []) {
      const row = map.get(r.userId);
      if (!row) continue;
      const day = dayjs(r.date).date();
      if (!row.days[day]) row.days[day] = 'X';
    }

    // Áp đơn nghỉ đã duyệt lên đúng các ngày giao với tháng đang xem.
    // Nghỉ phép được ưu tiên hiển thị hơn dấu 'X' chấm công (1 ngày không
    // thể vừa "đi làm" vừa "nghỉ" trên cùng 1 ô).
    for (const leave of leaveData || []) {
      const row = map.get(leave.requester.id);
      if (!row) continue;

      const leaveStart = dayjs(leave.startDate);
      const leaveEnd = dayjs(leave.endDate);
      const rangeStart = leaveStart.isAfter(monthStart) ? leaveStart : monthStart;
      const rangeEnd = leaveEnd.isBefore(monthEnd) ? leaveEnd : monthEnd;

      const isHalf = leave.duration !== 'full_day';
      const isUnpaid = leave.leaveType === 'unpaid';
      const mark: DayMark = isHalf ? (isUnpaid ? '1/2K' : 'X/2') : isUnpaid ? 'KL' : 'P';
      const fraction = isHalf ? 0.5 : 1;

      let cursor = rangeStart;
      while (!cursor.isAfter(rangeEnd, 'day')) {
        const day = cursor.date();
        row.days[day] = mark;
        row.actualWorkDays -= fraction;
        if (isUnpaid) row.unpaidLeaveDays += fraction;
        else row.paidLeaveDays += fraction;
        cursor = cursor.add(1, 'day');
      }
    }

    return Array.from(map.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [users, userId, attendanceData, leaveData, standardWorkDays, monthStart, monthEnd]);

  const dayColumns: ColumnsType<EmployeeMonthRow> = useMemo(() => {
    const cols: ColumnsType<EmployeeMonthRow> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = monthStart.date(d).day();
      const isSunday = dow === 0;
      cols.push({
        title: (
          <div style={{ lineHeight: 1.3 }}>
            <div>{d}</div>
            <div style={{ fontSize: 11, fontWeight: 400, color: isSunday ? '#cf1322' : '#8c8c8c' }}>
              {WEEKDAY_VN[dow]}
            </div>
          </div>
        ),
        key: `day-${d}`,
        width: 42,
        align: 'center',
        className: isSunday ? 'attendance-sunday-col' : undefined,
        render: (_: unknown, record: EmployeeMonthRow) => {
          const mark = record.days[d];
          if (!mark) return null;
          return (
            <span style={{ color: MARK_COLOR[mark], fontWeight: 600 }} title={MARK_LABEL[mark]}>
              {mark}
            </span>
          );
        },
      });
    }
    return cols;
  }, [daysInMonth, monthStart]);

  const columns: ColumnsType<EmployeeMonthRow> = [
    {
      title: 'STT',
      key: 'stt',
      width: 50,
      fixed: 'left',
      align: 'center',
      render: (_: unknown, __: EmployeeMonthRow, index: number) => index + 1,
    },
    {
      title: 'Họ và tên',
      dataIndex: 'userName',
      key: 'userName',
      width: 170,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: 'Vị trí',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 110,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: 'Ngày trong tháng',
      children: dayColumns,
    },
    {
      title: 'Ngày công thực tế',
      dataIndex: 'actualWorkDays',
      key: 'actualWorkDays',
      width: 120,
      fixed: 'right',
      align: 'center',
      render: (v: number) => <Text strong>{v.toFixed(1)}</Text>,
    },
    {
      title: 'Ngày nghỉ',
      children: [
        {
          title: 'Hưởng lương',
          dataIndex: 'paidLeaveDays',
          key: 'paidLeaveDays',
          width: 100,
          align: 'center',
          render: (v: number) => v.toFixed(1),
        },
        {
          title: 'Không lương',
          dataIndex: 'unpaidLeaveDays',
          key: 'unpaidLeaveDays',
          width: 100,
          align: 'center',
          render: (v: number) => v.toFixed(1),
        },
      ],
    },
    {
      title: 'Số ngày nghỉ phép còn lại',
      dataIndex: 'annualLeaveBalance',
      key: 'annualLeaveBalance',
      width: 130,
      fixed: 'right',
      align: 'center',
      render: (v: number | null) => (v != null ? v : '—'),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }} align="start">
        <Space wrap>
          <DatePicker
            picker="month"
            value={month}
            allowClear={false}
            format="MM/YYYY"
            onChange={(v) => v && setMonth(v.startOf('month'))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Lọc theo nhân viên"
            style={{ width: 220 }}
            value={userId}
            onChange={setUserId}
            options={(users || []).map((u: any) => ({ value: u.id, label: u.name }))}
          />
          <Text>
            Ngày công chuẩn tháng {month.format('MM/YYYY')}: <Text strong>{standardWorkDays}</Text>
          </Text>
        </Space>

        <Space size={4} wrap>
          {(Object.keys(MARK_LABEL) as DayMark[]).map((mark) => (
            <Tag key={mark} color={MARK_COLOR[mark]} style={{ marginRight: 0 }}>
              {mark}: {MARK_LABEL[mark]}
            </Tag>
          ))}
        </Space>
      </Space>

      <Table<EmployeeMonthRow>
        rowKey="userId"
        loading={attendanceLoading || leaveLoading || usersLoading}
        columns={columns}
        dataSource={rows}
        bordered
        size="small"
        pagination={false}
        scroll={{ x: 'max-content', y: 560 }}
      />
    </div>
  );
}
