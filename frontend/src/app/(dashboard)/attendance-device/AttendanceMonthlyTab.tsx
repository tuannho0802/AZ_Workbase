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

// Giờ vào/ra chuẩn - PHẢI khớp WORK_START_MINUTES/WORK_END_MINUTES bên
// backend (zk-device.service.ts). Chỉ dùng để tính SỐ PHÚT trễ/sớm hiển thị
// trong "Ghi chú" - việc "có tính là trễ/sớm hay không" vẫn lấy từ cờ
// isLate/isEarlyLeave do backend trả về (nguồn xác thực duy nhất).
const WORK_START_MINUTES = 9 * 60; // 09:00
const WORK_END_MINUTES = 18 * 60; // 18:00

interface LateEarlyEntry {
  dateStr: string; // DD/MM
  time: string; // HH:mm
  minutes: number; // số phút trễ (đi trễ) hoặc số phút sớm (về sớm)
}

interface EmployeeMonthRow {
  // rowKey duy nhất cho cả dòng đã map (userId thật) và chưa map
  // (deviceUserId) - dùng làm rowKey của Table, tránh trùng khi nhiều
  // deviceUserId khác nhau đều có userId=null.
  key: string;
  userId: number | null;
  deviceUserId: string | null; // chỉ có giá trị khi isMapped=false
  // Tên đăng ký TRÊN MÁY (từ cache) - có cho CẢ dòng đã map (dùng làm phụ đề
  // "(tên trên máy)" dưới tên nhân viên hệ thống) lẫn chưa map (dùng thẳng
  // làm userName - xem chỗ tạo unmappedMap bên dưới). null nếu cache chưa có
  // tên (vd log rất cũ, user đã bị xoá khỏi máy từ trước khi cache ra đời).
  deviceUserName: string | null;
  isMapped: boolean;
  userName: string;
  departmentName: string;
  annualLeaveBalance: number | null;
  days: Partial<Record<number, DayMark>>;
  actualWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  lateEntries: LateEarlyEntry[];
  earlyEntries: LateEarlyEntry[];
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
        key: `u-${u.id}`,
        userId: u.id,
        deviceUserId: null,
        deviceUserName: null,
        isMapped: true,
        userName: u.name,
        departmentName: u.department?.name || '—',
        annualLeaveBalance: u.annualLeaveBalance ?? null,
        days: {},
        // Tính lại ở bước cuối (xem "Tính lại actualWorkDays..." bên dưới) -
        // dựa trên dữ liệu chấm công/nghỉ phép THẬT, không gán cứng theo
        // Ngày công chuẩn nữa (bug đã phát hiện: nhân viên đã map luôn ra
        // đúng 1 số cố định dù có/không đi làm thật).
        actualWorkDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        lateEntries: [],
        earlyEntries: [],
      });
    }

    // Dòng riêng cho các deviceUserId CHƯA map với nhân viên hệ thống -
    // trước đây các log này bị lọc bỏ hoàn toàn ở backend
    // (WHERE matched_user_id IS NOT NULL), giờ backend đã trả về kèm
    // isMapped=false + userName lấy từ tên đăng ký TRÊN MÁY (cache) - hiển
    // thị riêng ra đây, có màu khác, để dễ nhận biết và biết cần map ai.
    const unmappedMap = new Map<string, EmployeeMonthRow>();

    // Đánh dấu 'X' từ dữ liệu chấm công thật (đi làm ngày nào) - dùng CẢ để
    // hiển thị trực quan LẪN để tính "Ngày công thực tế" (xem bước tính
    // WORK_CREDIT ở cuối, sau khi đã áp nghỉ phép đè lên). Đồng thời gom lại
    // từng lần đi trễ/về sớm trong tháng cho cột "Ghi chú" (theo đúng mẫu
    // bảng chấm công - liệt kê ngày/giờ + số phút trễ/sớm).
    for (const r of attendanceData?.data || []) {
      let row: EmployeeMonthRow | undefined;

      if (r.isMapped && r.userId != null) {
        row = map.get(r.userId);
        if (!row) continue; // bị lọc theo Select "Lọc theo nhân viên" ở trên
        // Ghi lại tên trên máy làm phụ đề - chỉ cần gán 1 lần (đủ dùng, dù
        // lý thuyết 1 nhân viên có thể có nhiều deviceUserId lịch sử do đổi
        // mapping - trường hợp hiếm, không đáng xử lý thêm cho tab tổng hợp).
        if (!row.deviceUserName && r.deviceUserName) row.deviceUserName = r.deviceUserName;
      } else {
        // Chưa map - lấy hoặc tạo mới dòng theo deviceUserId. Nếu người
        // dùng đang lọc theo 1 nhân viên cụ thể (userId !== undefined), ẩn
        // luôn các dòng chưa map để không gây nhiễu bảng đang lọc theo 1
        // người.
        if (userId) continue;
        const key = `d-${r.deviceUserId}`;
        row = unmappedMap.get(key);
        if (!row) {
          row = {
            key,
            userId: null,
            deviceUserId: r.deviceUserId,
            deviceUserName: r.deviceUserName,
            isMapped: false,
            userName: r.userName,
            departmentName: 'Chưa map với nhân viên',
            annualLeaveBalance: null,
            days: {},
            actualWorkDays: 0,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            lateEntries: [],
            earlyEntries: [],
          };
          unmappedMap.set(key, row);
        }
      }

      const day = dayjs(r.date).date();
      if (!row.days[day]) {
        // Suy luận "nghỉ nửa ngày KHÔNG LƯƠNG" (1/2K) TỪ CHÍNH dữ liệu chấm
        // công thật, không cần đơn nghỉ - áp dụng khi: (a) có giờ vào nhưng
        // CHƯA có giờ ra (status='missing_checkout' - không rõ có làm đủ
        // ngày hay bỏ về giữa chừng, nên tính thận trọng là nửa ngày), hoặc
        // (b) có đủ giờ vào/ra nhưng tổng giờ làm < 4.5 tiếng (nửa ca chuẩn
        // 9 tiếng/ngày). Chỉ là giá trị MẶC ĐỊNH: nếu ngày này có đơn nghỉ
        // ĐÃ DUYỆT (vòng lặp `leaveData` bên dưới, chạy SAU vòng này) sẽ ĐÈ
        // LÊN giá trị suy luận ở đây - đơn nghỉ luôn là nguồn xác thực cao
        // hơn (kể cả khi là nghỉ HƯỞNG LƯƠNG, dù có chấm công ngắn cũng vậy).
        const isHalfByAttendance =
          r.status === 'missing_checkout' || (r.workHours != null && r.workHours < 4.5);
        row.days[day] = isHalfByAttendance ? '1/2K' : 'X';
      }

      if (r.isLate && r.checkIn) {
        const checkIn = dayjs(r.checkIn);
        const minutesLate = checkIn.hour() * 60 + checkIn.minute() - WORK_START_MINUTES;
        if (minutesLate > 0) {
          row.lateEntries.push({
            dateStr: checkIn.format('DD/MM'),
            time: checkIn.format('HH:mm'),
            minutes: minutesLate,
          });
        }
      }
      if (r.isEarlyLeave && r.checkOut) {
        const checkOut = dayjs(r.checkOut);
        const minutesEarly = WORK_END_MINUTES - (checkOut.hour() * 60 + checkOut.minute());
        if (minutesEarly > 0) {
          row.earlyEntries.push({
            dateStr: checkOut.format('DD/MM'),
            time: checkOut.format('HH:mm'),
            minutes: minutesEarly,
          });
        }
      }
    }

    // Áp đơn nghỉ đã duyệt lên đúng các ngày giao với tháng đang xem.
    // Nghỉ phép được ưu tiên hiển thị hơn dấu 'X' chấm công (1 ngày không
    // thể vừa "đi làm" vừa "nghỉ" trên cùng 1 ô). CHỈ áp cho user ĐÃ map
    // (unmappedMap không có khái niệm nghỉ phép vì không phải nhân viên hệ
    // thống thật).
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
        if (isUnpaid) row.unpaidLeaveDays += fraction;
        else row.paidLeaveDays += fraction;
        cursor = cursor.add(1, 'day');
      }
    }

    // Suy luận "nghỉ không lương cả ngày" (KL) khi VẮNG KHÔNG PHÉP - ngày làm
    // việc (không phải Chủ nhật) đã trôi qua (KHÔNG đánh dấu ngày tương lai -
    // nhân viên chưa có cơ hội chấm công) mà không có dấu gì (không chấm
    // công, không đơn nghỉ nào che phủ) -> mặc định là vắng không lý do,
    // tính không lương. CHỈ áp cho user ĐÃ map (unmappedMap không có khái
    // niệm "phải đi làm" vì chưa xác định là nhân viên hệ thống nào).
    const today = dayjs();
    const lastDayToCheck = today.isBefore(monthEnd) ? today.date() : daysInMonth;
    for (const row of map.values()) {
      for (let d = 1; d <= lastDayToCheck; d++) {
        if (row.days[d]) continue; // đã có dấu (X, nghỉ phép, hoặc suy luận 1/2K ở trên)
        const isSunday = monthStart.date(d).day() === 0;
        if (isSunday) continue; // Chủ nhật không phải ngày công chuẩn - không tính vắng
        row.days[d] = 'KL';
        row.unpaidLeaveDays += 1;
      }
    }

    // Log chấm công không đảm bảo đến theo thứ tự ngày (đến từ query đã sort
    // theo recordTime ASC rồi gom nhóm) - sắp lại theo ngày cho dễ đọc.
    const allRows = [...map.values(), ...unmappedMap.values()];

    // Tính lại "Ngày công thực tế" từ đúng dấu NGÀY CUỐI CÙNG của từng ô
    // (row.days) - SAU khi cả 2 vòng lặp trên đã chạy xong, để không đếm
    // nhầm ngày vừa có chấm công (X) vừa trùng đơn nghỉ đã duyệt (nghỉ phép
    // ghi đè X ở bước trên, nên chỉ cần đếm theo dấu CUỐI CÙNG là chính xác,
    // không cần cộng/trừ rải rác qua nhiều bước như bản cũ - đúng nguyên
    // nhân bug "nhân viên đã map luôn ra cố định = Ngày công chuẩn" trước
    // đây: bản cũ gán actualWorkDays = standardWorkDays rồi chỉ trừ ngày
    // nghỉ, KHÔNG hề dựa vào dấu X thật - nhân viên có đi làm hay không vẫn
    // ra cùng 1 số).
    // Quy tắc tính công: X (đi làm thật) = 1 công; X/2 (nghỉ nửa ngày HƯỞNG
    // LƯƠNG) = 0.5 công; P (nghỉ phép hưởng lương cả ngày) = 1 công; 1/2K và
    // KL (nghỉ KHÔNG LƯƠNG) = 0 công (đúng bản chất "không lương" - không
    // tính là ngày công); không có dấu gì = 0 công (vắng không phép).
    const WORK_CREDIT: Record<DayMark, number> = {
      X: 1,
      'X/2': 0.5,
      P: 1,
      '1/2K': 0,
      KL: 0,
    };
    for (const row of allRows) {
      row.actualWorkDays = Object.values(row.days).reduce(
        (sum, mark) => sum + (mark ? WORK_CREDIT[mark] : 0),
        0,
      );
    }

    for (const row of allRows) {
      row.lateEntries.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      row.earlyEntries.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    }

    // Nhân viên đã map hiện trước (sắp theo tên), user chưa map dồn xuống
    // cuối bảng (sắp theo tên/UID trên máy) - để không xáo trộn danh sách
    // nhân viên quen thuộc, đồng thời vẫn thấy rõ ai cần được map.
    return [
      ...Array.from(map.values()).sort((a, b) => a.userName.localeCompare(b.userName)),
      ...Array.from(unmappedMap.values()).sort((a, b) => a.userName.localeCompare(b.userName)),
    ];
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
      key: 'userName',
      width: 190,
      fixed: 'left',
      ellipsis: true,
      render: (_: unknown, record: EmployeeMonthRow) =>
        record.isMapped ? (
          record.deviceUserName ? (
            // Đã map + biết tên trên máy - hiện tên hệ thống, kèm phụ đề tên
            // trên máy bên dưới (vd "Admin" / "(TuanIT)") để admin dễ đối
            // chiếu đang map đúng người trên máy hay không.
            <span title={`Đã map với "${record.deviceUserName}" trên máy`}>
              <div>{record.userName}</div>
              <div style={{ fontSize: 12, color: '#bfbfbf', fontWeight: 400 }}>
                ({record.deviceUserName})
              </div>
            </span>
          ) : (
            record.userName
          )
        ) : (
          <span title={`Chưa map - mã máy: ${record.deviceUserId}`}>
            <span style={{ color: '#d46b08' }}>{record.userName}</span>{' '}
            <Tag color="orange" style={{ marginLeft: 2 }}>
              chưa map
            </Tag>
          </span>
        ),
    },
    {
      title: 'Vị trí',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 110,
      fixed: 'left',
      ellipsis: true,
      render: (v: string, record: EmployeeMonthRow) =>
        record.isMapped ? v : <span style={{ color: '#d46b08' }}>{v}</span>,
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
    {
      title: 'Ghi chú',
      key: 'notes',
      width: 260,
      fixed: 'right',
      // Cột này thường dài hơn hẳn các cột số khác (nhiều dòng đi trễ/về
      // sớm) - nếu để mặc định, 1 dòng nhiều ghi chú sẽ kéo cả hàng cao vọt
      // lên, đồng thời 1 cột KHÔNG fixed đứng sau 2 cột fixed:'right' khác
      // (actualWorkDays, annualLeaveBalance) khiến antd render lệch/che
      // (đúng lỗi trong ảnh bạn gửi). Fix: (1) fixed:'right' luôn cho cột
      // này để nhất quán với 2 cột fixed phía trước, (2) giới hạn chiều cao
      // + cuộn dọc riêng bên trong ô để không đội chiều cao cả hàng.
      onCell: () => ({ style: { verticalAlign: 'top', padding: '8px 12px' } }),
      render: (_: unknown, record: EmployeeMonthRow) => {
        if (!record.lateEntries.length && !record.earlyEntries.length) return null;
        const totalLate = record.lateEntries.reduce((sum, e) => sum + e.minutes, 0);
        const totalEarly = record.earlyEntries.reduce((sum, e) => sum + e.minutes, 0);
        return (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.7,
              textAlign: 'left',
              maxHeight: 120,
              overflowY: 'auto',
            }}
          >
            {record.lateEntries.length > 0 && (
              <div>
                <Text style={{ color: MARK_COLOR['X/2'] }} strong>
                  Đi trễ:
                </Text>
                {record.lateEntries.map((e, i) => (
                  <div key={i}>
                    {e.dateStr} {e.time} (+{e.minutes} phút)
                  </div>
                ))}
                <div>Tổng trễ: {totalLate} phút</div>
              </div>
            )}
            {record.earlyEntries.length > 0 && (
              <div style={{ marginTop: record.lateEntries.length ? 4 : 0 }}>
                <Text style={{ color: MARK_COLOR['1/2K'] }} strong>
                  Về sớm:
                </Text>
                {record.earlyEntries.map((e, i) => (
                  <div key={i}>
                    {e.dateStr} {e.time} (-{e.minutes} phút)
                  </div>
                ))}
                <div>Tổng sớm: {totalEarly} phút</div>
              </div>
            )}
          </div>
        );
      },
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
        rowKey="key"
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