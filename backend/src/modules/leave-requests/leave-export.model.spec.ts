import { LeaveStatus } from '../../database/entities/leave-request.entity';
import type { LeaveStatsResponse } from './leave-requests-stats.service';
import {
  buildLeaveExportModel,
  bucketLabel,
  CHART_TOP_EMPLOYEES,
  DETAIL_ROW_CAP,
  EMPTY_NOTICE,
  guardFormula,
  LeaveExportRequestRow,
  safeSheetName,
  toPreviewModel,
} from './leave-export.model';
import {
  buildLeaveStats,
  granularityFor,
  HeadcountRow,
  LeaveStatRow,
  summarize,
} from './leave-stats.util';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

const statRow = (o: Partial<LeaveStatRow> & { id: number; requesterId: number }): LeaveStatRow => ({
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

const reqRow = (r: LeaveStatRow, o: Partial<LeaveExportRequestRow> = {}): LeaveExportRequestRow => ({
  id: r.id,
  requesterId: r.requesterId,
  requesterName: r.requesterName,
  departmentName: r.departmentName,
  leaveType: r.leaveType,
  status: r.status,
  startDate: r.startDate,
  endDate: r.endDate,
  totalDays: r.totalDays,
  isSupplementary: r.isSupplementary,
  approverName: 'Boss',
  rejectionReason: null,
  createdAt: '2026-08-30',
  ...o,
});

const hc = (userId: number, departmentId: number | null = 1, departmentName: string | null = 'Sales'): HeadcountRow => ({
  userId,
  departmentId,
  departmentName,
});

function makeStats(
  rows: LeaveStatRow[],
  headcount: HeadcountRow[],
  range = RANGE,
): LeaveStatsResponse {
  const spanDays = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1;
  const granularity = granularityFor(spanDays);
  const result = buildLeaveStats(rows, headcount, range, granularity);
  return {
    ...result,
    period: { type: 'month', from: range.from, to: range.to, granularity, spanDays },
    previousPeriod: { from: '2026-08-01', to: '2026-08-31' },
    headcount: headcount.length,
    previousSummary: summarize([], headcount.length),
  };
}

describe('leave-export.model', () => {
  describe('guardFormula / safeSheetName / bucketLabel', () => {
    it('prefixes dangerous leading chars and keeps normal text', () => {
      expect(guardFormula('=SUM(A1)')).toBe("'=SUM(A1)");
      expect(guardFormula('+84')).toBe("'+84");
      expect(guardFormula('-1')).toBe("'-1");
      expect(guardFormula('@x')).toBe("'@x");
      expect(guardFormula('Nguyễn Văn A')).toBe('Nguyễn Văn A');
      expect(guardFormula(null)).toBe('');
    });

    it('sanitizes and de-duplicates sheet names (max 31 chars)', () => {
      const used = new Set<string>();
      expect(safeSheetName('A/B:C?', used)).toBe('A B C');
      expect(safeSheetName('A B C', used)).toBe('A B C (2)');
      expect(safeSheetName('x'.repeat(40)).length).toBe(31);
      expect(safeSheetName('   ')).toBe('Sheet');
    });

    it('labels month and day buckets', () => {
      expect(bucketLabel('2026-09')).toBe('09/2026');
      expect(bucketLabel('2026-09-05')).toBe('05/09');
    });
  });

  describe('empty period', () => {
    const stats = makeStats([], [hc(1), hc(2)]);

    it.each(['A', 'B', 'C', 'D'] as const)('form %s: empty notice, no rows, no totals row', (form) => {
      const m = buildLeaveExportModel({ form, stats, requests: [] });
      expect(m.isEmpty).toBe(true);
      expect(m.notice).toBe(EMPTY_NOTICE);
      expect(m.sheets.length).toBeGreaterThan(0);
      for (const s of m.sheets) {
        expect(s.charts).toEqual([]);
        for (const t of s.tables) {
          if (t.id === 'byDepartment') {
            // Giống UI: phòng ban có quân số vẫn liệt kê, nhưng mọi số đơn/ngày = 0.
            expect(t.rows.every((r) => r.slice(2, 6).every((v) => v === 0))).toBe(true);
            continue;
          }
          expect(t.rows).toEqual([]);
          expect(t.totalRows).toBe(0);
          expect(t.truncated).toBe(false);
          expect(t.totalsRow).toBeUndefined();
        }
      }
    });

    it('form D still has period columns (zero-filled grid is just empty)', () => {
      const m = buildLeaveExportModel({ form: 'D', stats, requests: [] });
      const cols = m.sheets[0].tables[0].columns;
      expect(cols[0].key).toBe('name');
      expect(cols[cols.length - 1].key).toBe('total');
      expect(cols.length).toBe(2 + 30 + 1); // 30 ngày tháng 9
    });
  });

  describe('form A', () => {
    const rows = [
      statRow({ id: 1, requesterId: 1, requesterName: 'An', totalDays: 2, startDate: '2026-09-02' }),
      statRow({ id: 2, requesterId: 1, requesterName: 'An', status: LeaveStatus.REJECTED, totalDays: 1 }),
      statRow({ id: 3, requesterId: 2, requesterName: 'Bình', status: LeaveStatus.PENDING, totalDays: 3, isSupplementary: true }),
    ];
    // headcount có thêm user 3 và 4 KHÔNG có đơn nào
    const stats = makeStats(rows, [hc(1), hc(2), hc(3), hc(4)]);
    const m = buildLeaveExportModel({ form: 'A', stats });
    const t = m.sheets[0].tables[0];

    it('mirrors byEmployee 1-1 (same numbers and order as the UI)', () => {
      expect(t.rows.length).toBe(stats.byEmployee.length);
      const an = t.rows.find((r) => r[0] === 'An')!;
      // [name, dept, requests, approved, rejected, pending, supp, reqDays, appDays, rate]
      expect(an).toEqual(['An', 'Sales', 2, 1, 1, 0, 0, 3, 2, 50]);
    });

    it('employees with 0 requests are not rows (byEmployee only lists people with requests)', () => {
      expect(t.rows.map((r) => r[0]).sort()).toEqual(['An', 'Bình']);
    });

    it('rate stays null (not 0) when nothing has been decided yet', () => {
      const binh = t.rows.find((r) => r[0] === 'Bình')!;
      expect(binh[9]).toBeNull();
      expect(binh[6]).toBe(1); // bổ sung
    });

    it('totals row equals summary', () => {
      const s = stats.summary;
      expect(t.totalsRow).toEqual([
        'Tổng',
        '',
        s.requests,
        s.approved,
        s.rejected,
        s.pending,
        s.supplementary,
        s.requestedDays,
        s.approvedDays,
        s.approvalRate,
      ]);
    });

    it('overall rate null when no decided request at all', () => {
      const onlyPending = makeStats([statRow({ id: 9, requesterId: 1, status: LeaveStatus.PENDING })], [hc(1)]);
      const mm = buildLeaveExportModel({ form: 'A', stats: onlyPending });
      expect(mm.sheets[0].tables[0].totalsRow![9]).toBeNull();
      expect(mm.isEmpty).toBe(false);
      expect(mm.notice).toBeUndefined();
    });

    it('guards formula-like names and department', () => {
      const s2 = makeStats(
        [statRow({ id: 1, requesterId: 1, requesterName: '=cmd|x', departmentName: '+evil' })],
        [hc(1)],
      );
      const r = buildLeaveExportModel({ form: 'A', stats: s2 }).sheets[0].tables[0].rows[0];
      expect(r[0]).toBe("'=cmd|x");
      expect(r[1]).toBe("'+evil");
    });
  });

  describe('form B', () => {
    const base = [
      statRow({ id: 1, requesterId: 1, startDate: '2026-09-02' }),
      statRow({ id: 2, requesterId: 2, startDate: '2026-09-10', status: LeaveStatus.REJECTED, leaveType: 'sick' }),
      statRow({ id: 3, requesterId: 3, startDate: '2026-09-10', status: LeaveStatus.PENDING, isSupplementary: true }),
    ];
    const stats = makeStats(base, [hc(1), hc(2), hc(3)]);
    const requests = [
      reqRow(base[0]),
      reqRow(base[1], { rejectionReason: '=HYPERLINK("x")', approverName: 'Sếp', createdAt: new Date('2026-09-09T18:30:00Z') }),
      reqRow(base[2], { approverName: null }),
    ];

    it('sorts like getRequests (start date desc, id desc) and maps labels', () => {
      const t = buildLeaveExportModel({ form: 'B', stats, requests, leaveTypeNames: { sick: 'Nghỉ ốm' } }).sheets[0].tables[0];
      expect(t.rows.map((r) => r[0])).toEqual([3, 2, 1]);
      const r2 = t.rows[1];
      expect(r2[3]).toBe('Nghỉ ốm');
      expect(r2[4]).toBe('2026-09-10');
      expect(r2[7]).toBe('Từ chối');
      expect(r2[9]).toBe("'=HYPERLINK(\"x\")");
      // 18:30 UTC ngày 09 = 01:30 ngày 10 giờ VN
      expect(r2[11]).toBe('2026-09-10');
      expect(t.rows[0][10]).toBe('Có');
      expect(t.rows[0][8]).toBe(''); // chưa có người duyệt
      expect(t.rows[2][3]).toBe('annual'); // thiếu tên -> dùng code
    });

    it('row count matches summary.requests and totals days', () => {
      const t = buildLeaveExportModel({ form: 'B', stats, requests }).sheets[0].tables[0];
      expect(t.totalRows).toBe(stats.summary.requests);
      expect(t.totalsRow![6]).toBe(3);
      expect(t.truncated).toBe(false);
      expect(t.note).toBeUndefined();
    });

    it('caps rows, keeps the newest, reports real total + note', () => {
      const many = Array.from({ length: 12 }, (_, i) =>
        reqRow(statRow({ id: i + 1, requesterId: 1, startDate: `2026-09-${String(i + 1).padStart(2, '0')}` })),
      );
      const t = buildLeaveExportModel({ form: 'B', stats, requests: many, detailRowCap: 5 }).sheets[0].tables[0];
      expect(t.rows.length).toBe(5);
      expect(t.totalRows).toBe(12);
      expect(t.truncated).toBe(true);
      expect(t.rows[0][0]).toBe(12);
      expect(t.note).toContain('5');
      expect(t.note).toContain('12');
    });

    it('default cap is DETAIL_ROW_CAP and an exact-fit list is not truncated', () => {
      expect(DETAIL_ROW_CAP).toBeGreaterThan(0);
      const exact = Array.from({ length: 5 }, (_, i) => reqRow(statRow({ id: i + 1, requesterId: 1 })));
      const t = buildLeaveExportModel({ form: 'B', stats, requests: exact, detailRowCap: 5 }).sheets[0].tables[0];
      expect(t.truncated).toBe(false);
      expect(t.rows.length).toBe(5);
    });

    it('does not mutate the input array', () => {
      const copy = [...requests];
      buildLeaveExportModel({ form: 'B', stats, requests });
      expect(requests).toEqual(copy);
    });
  });

  describe('form C', () => {
    const rows = [
      statRow({ id: 1, requesterId: 1, totalDays: 2, departmentId: 1, departmentName: 'Sales' }),
      statRow({ id: 2, requesterId: 2, totalDays: 1, departmentId: 2, departmentName: 'IT', leaveType: 'sick' }),
      statRow({ id: 3, requesterId: 1, totalDays: 1, departmentId: 1, departmentName: 'Sales', leaveType: 'sick', status: LeaveStatus.PENDING }),
    ];
    const stats = makeStats(rows, [hc(1), hc(2), hc(3, 3, 'Ops')]);
    const m = buildLeaveExportModel({ form: 'C', stats, leaveTypeNames: { annual: 'Phép năm', sick: 'Nghỉ ốm' } });

    it('has 2 sheets with distinct names', () => {
      expect(m.sheets.length).toBe(2);
      expect(new Set(m.sheets.map((s) => s.name)).size).toBe(2);
    });

    it('department table includes departments with headcount but 0 requests', () => {
      const t = m.sheets[0].tables[0];
      expect(t.rows.map((r) => r[0]).sort()).toEqual(['IT', 'Ops', 'Sales']);
      const ops = t.rows.find((r) => r[0] === 'Ops')!;
      expect(ops.slice(1, 6)).toEqual([1, 0, 0, 0, 0]);
      expect(ops[6]).toBe(0);
    });

    it('totals use unique people from summary (not a sum over departments)', () => {
      const t = m.sheets[0].tables[0];
      expect(t.totalsRow![3]).toBe(stats.summary.employees);
      expect(t.totalsRow![2]).toBe(3);
      const ty = m.sheets[1].tables[0];
      expect(ty.totalsRow![1]).toBe(3);
      expect(ty.totalsRow![2]).toBe(stats.summary.employees);
    });

    it('type table uses display names', () => {
      const ty = m.sheets[1].tables[0];
      expect(ty.rows.map((r) => r[0]).sort()).toEqual(['Nghỉ ốm', 'Phép năm']);
    });

    it('null rates stay null when headcount is 0', () => {
      const s = makeStats([], []);
      const t = buildLeaveExportModel({ form: 'C', stats: s }).sheets[0].tables[0];
      expect(t.rows).toEqual([]);
      expect(s.summary.participationRate).toBeNull();
    });
  });

  describe('form D', () => {
    const rows = [
      statRow({ id: 1, requesterId: 1, requesterName: 'An', startDate: '2026-09-02' }),
      statRow({ id: 2, requesterId: 1, requesterName: 'An', startDate: '2026-09-02' }),
      statRow({ id: 3, requesterId: 2, requesterName: 'An', startDate: '2026-09-05' }), // trùng tên, người khác
      statRow({ id: 4, requesterId: 3, requesterName: 'Chi', startDate: '2026-08-28', endDate: '2026-09-03' }), // vắt từ tháng trước -> kẹp về đầu kỳ
    ];
    const stats = makeStats(rows, [hc(1), hc(2), hc(3), hc(4)]);
    const requests = rows.map((r) => reqRow(r));
    const t = buildLeaveExportModel({ form: 'D', stats, requests }).sheets[0].tables[0];
    const bucketIdx = (label: string) => t.columns.findIndex((c) => c.header === label);

    it('groups by user id (same-name users stay separate), 0-request employees absent', () => {
      expect(t.rows.length).toBe(3);
      expect(t.rows.filter((r) => r[0] === 'An').length).toBe(2);
    });

    it('column totals match the trend chart bucket by bucket', () => {
      stats.trend.forEach((p, i) => {
        expect(t.totalsRow![2 + i]).toBe(p.requests);
      });
      expect(t.totalsRow![t.totalsRow!.length - 1]).toBe(stats.summary.requests);
    });

    it('clamps requests starting before the period into the first bucket', () => {
      const chi = t.rows.find((r) => r[0] === 'Chi')!;
      expect(chi[bucketIdx('01/09')]).toBe(1);
    });

    it('row totals add up and rows sorted by total desc', () => {
      const last = t.columns.length - 1;
      const totals = t.rows.map((r) => r[last] as number);
      expect(totals).toEqual([...totals].sort((a, b) => b - a));
      expect(t.rows[0][last]).toBe(2);
    });

    it('uses month columns for long periods', () => {
      const range = { from: '2026-01-01', to: '2026-12-31' };
      const long = makeStats(
        [statRow({ id: 1, requesterId: 1, startDate: '2026-03-10' })],
        [hc(1)],
        range,
      );
      const lt = buildLeaveExportModel({
        form: 'D',
        stats: long,
        requests: [reqRow(statRow({ id: 1, requesterId: 1, startDate: '2026-03-10' }))],
      }).sheets[0].tables[0];
      expect(lt.columns.length).toBe(2 + 12 + 1);
      expect(lt.columns[2].header).toBe('01/2026');
      expect(lt.rows[0][2 + 2]).toBe(1); // tháng 3
    });
  });

  describe('toPreviewModel', () => {
    const rows = Array.from({ length: 30 }, (_, i) => statRow({ id: i + 1, requesterId: i + 1 }));
    const stats = makeStats(rows, rows.map((r) => hc(r.requesterId)));
    const full = buildLeaveExportModel({ form: 'A', stats });

    it('cuts to 20 rows, keeps real total, flags truncated, leaves source untouched', () => {
      const p = toPreviewModel(full);
      const t = p.sheets[0].tables[0];
      expect(t.rows.length).toBe(20);
      expect(t.totalRows).toBe(30);
      expect(t.truncated).toBe(true);
      expect(t.totalsRow).toEqual(full.sheets[0].tables[0].totalsRow);
      expect(full.sheets[0].tables[0].rows.length).toBe(30);
    });

    it('does not flag short tables', () => {
      const small = buildLeaveExportModel({ form: 'A', stats: makeStats(rows.slice(0, 3), [hc(1)]) });
      const t = toPreviewModel(small).sheets[0].tables[0];
      expect(t.truncated).toBe(false);
      expect(t.rows.length).toBe(3);
    });
  });

  it('throws on unknown form', () => {
    expect(() => buildLeaveExportModel({ form: 'Z' as any, stats: makeStats([], []) })).toThrow();
  });
});

describe('buildLeaveExportModel - form F (gói đầy đủ A-E)', () => {
  it('gộp sheet của A, B, C, D, E; tên sheet không trùng; chỉ sheet E có chart khi có dữ liệu', () => {
    const stats: any = {
      period: { type: 'month', from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59', granularity: 'day', spanDays: 30 },
      summary: { requests: 0, approved: 0, rejected: 0, pending: 0, supplementary: 0, approvalRate: null, employees: 0 },
      byEmployee: [], byDepartment: [], byType: [], trend: [], byWeekday: [], frequency: [],
    };
    const m = buildLeaveExportModel({ form: 'F', stats, requests: [] });
    const names = m.sheets.map((s) => s.name);
    expect(m.form).toBe('F');
    expect(names.length).toBe(6); // A, B, C(2 sheet), D, E
    expect(new Set(names).size).toBe(names.length);
    expect(m.sheets.every((s) => s.charts.length === 0)).toBe(true); // kỳ rỗng => không chart
  });
});

describe('buildLeaveExportModel - form E (chart)', () => {
  const rows = [
    statRow({ id: 1, requesterId: 1, status: LeaveStatus.APPROVED, startDate: '2026-09-02' }),
    statRow({ id: 2, requesterId: 1, status: LeaveStatus.REJECTED, startDate: '2026-09-03' }),
    statRow({ id: 3, requesterId: 2, status: LeaveStatus.PENDING, startDate: '2026-09-04', leaveType: 'sick' }),
    statRow({ id: 4, requesterId: 3, status: LeaveStatus.APPROVED, startDate: '2026-09-05' }),
  ];
  const stats = makeStats(rows, [hc(1), hc(2), hc(3)]);
  const m = buildLeaveExportModel({ form: 'E', stats, leaveTypeNames: { annual: 'Phép năm', sick: 'Phép ốm' } });
  const sheet = m.sheets[0];

  it('1 sheet, 3 chart đúng loại; bảng nguồn tồn tại trên cùng sheet; bảng A đầy đủ ở cuối', () => {
    expect(m.sheets).toHaveLength(1);
    expect(sheet.charts.map((c) => [c.id, c.type])).toEqual([
      ['employeeStacked', 'barStacked'],
      ['typeDonut', 'doughnut'],
      ['trendLine', 'line'],
    ]);
    const ids = sheet.tables.map((t) => t.id);
    for (const c of sheet.charts) expect(ids).toContain(c.tableId);
    expect(ids[ids.length - 1]).toBe('byEmployee');
  });

  it('mỗi chart: số hạng mục = số dòng bảng nguồn, giá trị = ô trong bảng; tên series = header cột', () => {
    for (const c of sheet.charts) {
      const t = sheet.tables.find((x) => x.id === c.tableId)!;
      expect(c.categories).toHaveLength(t.rows.length);
      const catIdx = t.columns.findIndex((x) => x.key === c.categoryKey);
      expect(t.rows.map((r) => r[catIdx])).toEqual(c.categories);
      for (const s of c.series) {
        const i = t.columns.findIndex((x) => x.key === s.key);
        expect(t.columns[i].header).toBe(s.name);
        expect(t.rows.map((r) => r[i])).toEqual(s.values);
        expect(s.color).toMatch(/^[0-9A-F]{6}$/);
      }
    }
  });

  it('donut hiện tên loại phép (không phải mã) + đủ màu từng lát; tổng đơn khớp summary', () => {
    const d = sheet.charts.find((c) => c.id === 'typeDonut')!;
    expect(d.categories.sort()).toEqual(['Phép năm', 'Phép ốm']);
    expect(d.pointColors).toHaveLength(d.categories.length);
    expect(d.series[0].values.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(stats.summary.requests);
  });

  it('đường xu hướng khớp trend (cùng số bucket, tổng = tổng đơn)', () => {
    const l = sheet.charts.find((c) => c.id === 'trendLine')!;
    expect(l.categories).toHaveLength(stats.trend.length);
    expect(l.series[0].values.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(stats.summary.requests);
  });

  it('cột chồng: top N theo số đơn giảm dần, tối đa CHART_TOP_EMPLOYEES', () => {
    const many = Array.from({ length: 15 }, (_, i) => statRow({ id: 100 + i, requesterId: 10 + i }));
    const st = makeStats(many, many.map((r) => hc(r.requesterId)));
    const e = buildLeaveExportModel({ form: 'E', stats: st }).sheets[0].charts[0];
    expect(e.categories).toHaveLength(CHART_TOP_EMPLOYEES);
  });

  it('kỳ rỗng: không chart nhưng vẫn có bảng + thông báo', () => {
    const empty = buildLeaveExportModel({ form: 'E', stats: makeStats([], [hc(1)]) });
    expect(empty.isEmpty).toBe(true);
    expect(empty.notice).toBe(EMPTY_NOTICE);
    expect(empty.sheets[0].charts).toEqual([]);
    expect(empty.sheets[0].tables.length).toBeGreaterThan(0);
  });

  it('KPI: tỷ lệ chưa có kết quả giữ null (không ép 0)', () => {
    const only = makeStats([statRow({ id: 9, requesterId: 1, status: LeaveStatus.PENDING })], [hc(1)]);
    const k = buildLeaveExportModel({ form: 'E', stats: only }).sheets[0].tables[0];
    expect(k.rows.find((r) => r[0] === 'Tỷ lệ duyệt (%)')![1]).toBeNull();
  });

  it('preview giữ nguyên chart (chỉ cắt dòng bảng)', () => {
    const p = toPreviewModel(m);
    expect(p.sheets[0].charts).toEqual(sheet.charts);
  });

  it('tên nhân viên bắt đầu bằng "=" được chống formula injection ở cả bảng lẫn nhãn chart', () => {
    const evil = [statRow({ id: 1, requesterId: 1, requesterName: '=HYPERLINK("x")' })];
    const e = buildLeaveExportModel({ form: 'E', stats: makeStats(evil, [hc(1)]) }).sheets[0].charts[0];
    expect(e.categories[0].startsWith("'=")).toBe(true);
  });
});
