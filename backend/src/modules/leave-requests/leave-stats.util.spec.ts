import { LeaveStatus } from '../../database/entities/leave-request.entity';
import {
  buildBuckets,
  buildLeaveStats,
  filterLeaveRowsForDrill,
  granularityFor,
  HeadcountRow,
  LeaveStatRow,
  summarize,
  toYmd,
  trendBucketOf,
  weekdayOf,
} from './leave-stats.util';

const row = (o: Partial<LeaveStatRow> & { id: number; requesterId: number }): LeaveStatRow => ({
  requesterName: `U${o.requesterId}`,
  departmentId: 1,
  departmentName: 'Sales',
  leaveType: 'annual',
  status: LeaveStatus.APPROVED,
  startDate: '2026-09-02',
  endDate: '2026-09-02',
  totalDays: 1,
  isSupplementary: false,
  ...o,
});
const hc = (userId: number, departmentId: number | null = 1, departmentName: string | null = 'Sales'): HeadcountRow => ({
  userId,
  departmentId,
  departmentName,
});

describe('leave-stats.util', () => {
  describe('helper ngày', () => {
    it('toYmd nhận string và Date (getter local)', () => {
      expect(toYmd('2026-09-02')).toBe('2026-09-02');
      expect(toYmd('2026-09-02T00:00:00.000Z')).toBe('2026-09-02');
      expect(toYmd(new Date(2026, 8, 2))).toBe('2026-09-02');
    });
    it('weekdayOf: Thứ Hai=1 ... Chủ Nhật=7', () => {
      expect(weekdayOf('2026-09-28')).toBe(1); // Thứ Hai
      expect(weekdayOf('2026-09-30')).toBe(3);
      expect(weekdayOf('2026-10-04')).toBe(7); // Chủ Nhật
    });
    it('granularityFor: > 92 ngày -> month', () => {
      expect(granularityFor(92)).toBe('day');
      expect(granularityFor(93)).toBe('month');
    });
    it('buildBuckets phủ kín ngày và tháng', () => {
      expect(buildBuckets('2026-09-29 00:00:00', '2026-10-02 23:59:59', 'day')).toEqual([
        '2026-09-29',
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
      ]);
      expect(buildBuckets('2026-01-15', '2026-03-10', 'month')).toEqual(['2026-01', '2026-02', '2026-03']);
    });
  });

  describe('summarize', () => {
    it('kỳ rỗng -> số 0, các tỷ lệ null (không chia 0)', () => {
      const s = summarize([], 0);
      expect(s).toMatchObject({ requests: 0, approvedDays: 0, employees: 0 });
      expect(s.participationRate).toBeNull();
      expect(s.avgApprovedDaysPerHead).toBeNull();
      expect(s.approvalRate).toBeNull();
      expect(s.supplementaryRate).toBeNull();
    });

    it('tỷ lệ duyệt chỉ tính đơn đã có kết quả (bỏ pending khỏi mẫu số)', () => {
      const rows = [
        row({ id: 1, requesterId: 1, status: LeaveStatus.APPROVED, totalDays: 2 }),
        row({ id: 2, requesterId: 1, status: LeaveStatus.APPROVED, totalDays: 0.5 }),
        row({ id: 3, requesterId: 2, status: LeaveStatus.REJECTED, totalDays: 1 }),
        row({ id: 4, requesterId: 3, status: LeaveStatus.PENDING, totalDays: 3, isSupplementary: true }),
      ];
      const s = summarize(rows, 10);
      expect(s.requests).toBe(4);
      expect(s.requestedDays).toBe(6.5);
      expect(s.approvedDays).toBe(2.5);
      expect(s.approvalRate).toBe(66.7); // 2/3
      expect(s.rejectionRate).toBe(33.3);
      expect(s.employees).toBe(3);
      expect(s.participationRate).toBe(30); // 3/10
      expect(s.avgApprovedDaysPerHead).toBe(0.25);
      expect(s.supplementary).toBe(1);
      expect(s.supplementaryRate).toBe(25);
    });

    it('người đã rời quân số (không có trong memberIds) không đẩy tỷ lệ tham gia vượt 100%', () => {
      const rows = [row({ id: 1, requesterId: 1 }), row({ id: 2, requesterId: 99 })];
      const s = summarize(rows, 1, new Set([1]));
      expect(s.employees).toBe(2);
      expect(s.participationRate).toBe(100);
    });
  });

  describe('buildLeaveStats', () => {
    const range = { from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59' };
    const headcount = [hc(1), hc(2), hc(3), hc(4, 2, 'Marketing')];
    const rows = [
      row({ id: 1, requesterId: 1, leaveType: 'annual', totalDays: 2, startDate: '2026-09-02', endDate: '2026-09-03' }),
      row({ id: 2, requesterId: 1, leaveType: 'sick', totalDays: 1, startDate: '2026-09-10', endDate: '2026-09-10', status: LeaveStatus.REJECTED }),
      row({ id: 3, requesterId: 2, leaveType: 'annual', totalDays: 0.5, startDate: '2026-09-10', endDate: '2026-09-10' }),
      // đơn bắt đầu TRƯỚC kỳ -> xu hướng kẹp về ngày đầu kỳ
      row({ id: 4, requesterId: 4, departmentId: 2, departmentName: 'Marketing', leaveType: 'annual', totalDays: 3, startDate: '2026-08-30', endDate: '2026-09-01', status: LeaveStatus.PENDING }),
    ];
    const r = buildLeaveStats(rows, headcount, range, 'day');

    it('byType xếp theo số đơn, tách ngày duyệt/ngày xin', () => {
      expect(r.byType.map((t) => t.code)).toEqual(['annual', 'sick']);
      expect(r.byType[0]).toMatchObject({ requests: 3, requestedDays: 5.5, approvedDays: 2.5, employees: 3 });
      expect(r.byType[1]).toMatchObject({ requests: 1, approvedDays: 0, employees: 1 });
    });

    it('byDepartment có quân số + tỷ lệ tham gia, gồm phòng ban 0 đơn', () => {
      const sales = r.byDepartment.find((d) => d.departmentName === 'Sales')!;
      const mkt = r.byDepartment.find((d) => d.departmentName === 'Marketing')!;
      expect(sales).toMatchObject({ headcount: 3, employees: 2, participationRate: 66.7, approvedDays: 2.5 });
      expect(sales.avgApprovedDaysPerHead).toBe(0.83);
      expect(mkt).toMatchObject({ headcount: 1, employees: 1, participationRate: 100, approvedDays: 0 });

      const empty = buildLeaveStats([], [hc(7, 5, 'Ops')], range, 'day');
      expect(empty.byDepartment).toEqual([
        expect.objectContaining({ departmentName: 'Ops', headcount: 1, requests: 0, participationRate: 0 }),
      ]);
    });

    it('byEmployee xếp theo ngày nghỉ đã duyệt giảm dần + tỷ lệ duyệt cá nhân', () => {
      expect(r.byEmployee.map((e) => e.userId)).toEqual([1, 2, 4]);
      expect(r.byEmployee[0]).toMatchObject({ userId: 1, requests: 2, approved: 1, rejected: 1, approvedDays: 2, approvalRate: 50 });
      expect(r.byEmployee[2]).toMatchObject({ userId: 4, pending: 1, approvalRate: null });
    });

    it('trend phủ kín 30 ngày, kẹp đơn bắt đầu trước kỳ về ngày đầu kỳ', () => {
      expect(r.trend).toHaveLength(30);
      expect(r.trend[0]).toMatchObject({ bucket: '2026-09-01', requests: 1, pending: 1 });
      expect(r.trend.find((p) => p.bucket === '2026-09-10')).toMatchObject({ requests: 2, approved: 1, rejected: 1, approvedDays: 0.5 });
      expect(r.trend.reduce((s, p) => s + p.requests, 0)).toBe(4);
    });

    it('trend theo tháng khi granularity=month', () => {
      const m = buildLeaveStats(rows, headcount, { from: '2026-08-01', to: '2026-09-30' }, 'month');
      expect(m.trend.map((p) => p.bucket)).toEqual(['2026-08', '2026-09']);
      expect(m.trend[0].requests).toBe(1); // đơn 30/8
      expect(m.trend[1].requests).toBe(3);
    });

    it('byWeekday luôn đủ 7 phần tử, gom theo ngày bắt đầu', () => {
      expect(r.byWeekday).toHaveLength(7);
      expect(r.byWeekday.reduce((s, w) => s + w.requests, 0)).toBe(4);
      expect(r.byWeekday[3].requests).toBe(2); // 2026-09-10 là Thứ Năm
    });

    it('frequency phủ toàn quân số: tổng nhóm = số người', () => {
      const byKey = Object.fromEntries(r.frequency.map((f) => [f.key, f.employees]));
      expect(byKey).toEqual({ '0': 1, '1': 2, '2': 1, '3-4': 0, '5+': 0 });
      expect(r.frequency.reduce((s, f) => s + f.employees, 0)).toBe(4);
    });

    it('frequency đếm cả người có đơn nhưng không còn trong quân số', () => {
      const f = buildLeaveStats([row({ id: 1, requesterId: 99 })], [hc(1)], range, 'day').frequency;
      expect(f.reduce((s, x) => s + x.employees, 0)).toBe(2);
    });
  });
});

describe('drill-down (Mini Table đơn nghỉ)', () => {
  const range = { from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59' };
  const rows: LeaveStatRow[] = [
    row({ id: 1, requesterId: 1, requesterName: 'Nguyễn An', startDate: '2026-08-28', endDate: '2026-09-02' }), // bắt đầu trước kỳ
    row({ id: 2, requesterId: 2, requesterName: 'Đặng Bình', status: LeaveStatus.PENDING, startDate: '2026-09-07', endDate: '2026-09-07' }), // Thứ 2
    row({ id: 3, requesterId: 2, status: LeaveStatus.REJECTED, startDate: '2026-09-10', endDate: '2026-09-11', isSupplementary: true }),
    row({ id: 4, requesterId: 3, departmentName: 'Kế toán', startDate: '2026-09-29', endDate: '2026-10-02' }), // vắt sang kỳ sau
  ];
  const ids = (f: Parameters<typeof filterLeaveRowsForDrill>[1]) => filterLeaveRowsForDrill(rows, f, range, 'day').map((r) => r.id);

  it('trendBucketOf kẹp đơn bắt đầu trước/sau kỳ về đầu/cuối kỳ (khớp biểu đồ)', () => {
    expect(trendBucketOf('2026-08-28', '2026-09-01', '2026-09-30', 'day')).toBe('2026-09-01');
    expect(trendBucketOf('2026-10-05', '2026-09-01', '2026-09-30', 'day')).toBe('2026-09-30');
    expect(trendBucketOf('2026-09-15', '2026-09-01', '2026-09-30', 'month')).toBe('2026-09');
  });

  it('bucket ngày đầu kỳ gồm cả đơn bắt đầu trước kỳ (cùng số với cột biểu đồ)', () => {
    expect(ids({ bucket: '2026-09-01' })).toEqual([1]);
    const trend = buildLeaveStats(rows, [], range, 'day').trend.find((t) => t.bucket === '2026-09-01');
    expect(trend?.requests).toBe(1);
  });

  it('lọc theo trạng thái / đơn bổ sung / nhiều nhân viên / thứ', () => {
    expect(ids({ status: LeaveStatus.PENDING })).toEqual([2]);
    expect(ids({ quick: 'supplementary' })).toEqual([3]);
    expect(ids({ requesterIds: [2, 3] })).toEqual([2, 3, 4]);
    expect(ids({ weekday: 1 })).toEqual([2]); // 2026-09-07 là Thứ Hai
  });

  it('số dòng theo thứ khớp biểu đồ "ngày trong tuần"', () => {
    const wd = buildLeaveStats(rows, [], range, 'day').byWeekday;
    for (const w of wd) expect(ids({ weekday: w.weekday })).toHaveLength(w.requests);
  });

  it('khoảng ngày giao nhau + tìm tên không phân biệt hoa thường/dấu', () => {
    expect(ids({ fromDate: '2026-10-01', toDate: '2026-10-31' })).toEqual([4]);
    expect(ids({ search: 'dang binh' })).toEqual([2]);
    expect(ids({ search: 'ke toan' })).toEqual([4]);
  });

  it('không lọc gì -> trả đủ; requesterIds rỗng coi như không lọc', () => {
    expect(ids({})).toEqual([1, 2, 3, 4]);
    expect(ids({ requesterIds: [] })).toEqual([1, 2, 3, 4]);
  });
});
