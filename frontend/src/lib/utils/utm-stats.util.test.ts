import { describe, expect, it } from 'vitest';
import {
  bucketLabel,
  bucketLabelFull,
  bucketRange,
  buildDrill,
  dropUnknownUtmIds,
  EMPTY_STATS_FILTERS,
  fmtPct,
  groupCustomerIdsByUtm,
  hasActiveStatsFilters,
  managerOptions,
  matchesManagers,
  mergedUtmIds,
  pruneUtmSelection,
  ratePct,
  rateColor,
  rateLevel,
  RATE_COLORS,
  sortUtmStatsRows,
  statusesWithData,
  toChartRows,
  toStatsFilterParams,
  utmOptionsFor,
  utmScopeLabel,
} from './utm-stats.util';

const statuses = [
  { code: 'pending', name: 'Chờ', color: '#faad14' },
  { code: 'closed', name: 'Chốt', color: '#52c41a' },
];

describe('utm-stats.util', () => {
  it('ratePct: làm tròn 1 chữ số, tổng 0 -> 0', () => {
    expect(ratePct(1, 3)).toBe(33.3);
    expect(ratePct(2, 3)).toBe(66.7);
    expect(ratePct(0, 0)).toBe(0);
    expect(ratePct(5, 0)).toBe(0);
  });

  it('fmtPct: số nguyên không thập phân, dấu phẩy kiểu VN', () => {
    expect(fmtPct(50)).toBe('50%');
    expect(fmtPct(33.3)).toBe('33,3%');
    expect(fmtPct(0)).toBe('0%');
  });

  it('bucketLabel: ngày -> DD/MM, tháng -> MM/YYYY', () => {
    expect(bucketLabel('2026-09-05')).toBe('05/09');
    expect(bucketLabel('2026-09')).toBe('09/2026');
    expect(bucketLabelFull('2026-09-05')).toBe('05/09/2026');
    expect(bucketLabelFull('2026-09')).toBe('Tháng 09/2026');
  });

  it('toChartRows: mode count = số khách; percent = % của chính ngày; luôn kèm __n và __p', () => {
    const series = [
      { date: '2026-09-28', total: 4, byStatus: { pending: 3, closed: 1 } },
      { date: '2026-09-29', total: 0, byStatus: { pending: 0, closed: 0 } },
    ];
    const count = toChartRows(series, statuses, 'count');
    expect(count[0]).toMatchObject({ label: '28/09', total: 4, pending: 3, closed: 1, pending__n: 3, pending__p: 75, closed__p: 25 });
    const pct = toChartRows(series, statuses, 'percent');
    expect(pct[0]).toMatchObject({ pending: 75, closed: 25, pending__n: 3 });
    // Ngày không có khách: không NaN
    expect(pct[1]).toMatchObject({ pending: 0, closed: 0, total: 0 });
  });

  it('toChartRows: thiếu key status trong byStatus -> coi là 0', () => {
    const rows = toChartRows([{ date: '2026-09-28', total: 2, byStatus: { pending: 2 } }], statuses, 'count');
    expect(rows[0].closed).toBe(0);
  });

  it('statusesWithData: chỉ giữ status có khách', () => {
    expect(statusesWithData(statuses, { pending: 2, closed: 0 }).map((s) => s.code)).toEqual(['pending']);
  });

  it('sortUtmStatsRows: nhiều khách trước, bằng nhau theo tên; không đổi mảng gốc', () => {
    const rows = [
      { utmId: 1, total: 2, byStatus: {} },
      { utmId: 2, total: 5, byStatus: {} },
      { utmId: 3, total: 2, byStatus: {} },
    ];
    const names: Record<number, string> = { 1: 'Zalo', 2: 'FB', 3: 'Ads' };
    expect(sortUtmStatsRows(rows, (id) => names[id]).map((r) => r.utmId)).toEqual([2, 3, 1]);
    expect(rows[0].utmId).toBe(1);
  });

  it('utmScopeLabel: own / department / all', () => {
    expect(utmScopeLabel('all')).toBe('Tất cả UTM');
    expect(utmScopeLabel('own')).toContain('Quản lý chính/phụ');
    expect(utmScopeLabel('department')).toContain('phòng ban');
  });
});

const utms = [
  { id: 1, name: 'Zeta', color: '#111', isActive: true, primaryManager: { id: 10, name: 'Bình' }, secondaryManagers: [{ id: 20, name: 'Cường' }, { id: 21, name: 'An' }] },
  { id: 2, name: 'Alpha', color: '#222', isActive: false, primaryManager: { id: 11, name: 'An' }, secondaryManagers: [] },
  { id: 3, name: 'Beta', color: '#333', isActive: true, primaryManager: { id: 10, name: 'Bình' }, secondaryManagers: [{ id: 20, name: 'Cường' }] },
  { id: 4, name: 'NoOwner', color: '#444', isActive: true, primaryManager: null, secondaryManagers: [] },
];

describe('Quick Filter helpers', () => {
  it('managerOptions: chỉ user ĐANG quản lý UTM, không trùng, sắp theo tên (vi)', () => {
    expect(managerOptions(utms, 'primary')).toEqual([{ value: 11, label: 'An' }, { value: 10, label: 'Bình' }]);
    expect(managerOptions([{ ...utms[0], primaryManager: { id: 1, name: 'X', role: 'marketing' } }], 'primary')[0].role).toBe('marketing');
    expect(managerOptions(utms, 'secondary')).toEqual([{ value: 21, label: 'An' }, { value: 20, label: 'Cường' }]);
    expect(managerOptions([], 'primary')).toEqual([]);
  });

  it('utmOptionsFor: tách UTM hoạt động / đã khoá, sắp theo tên', () => {
    expect(utmOptionsFor(utms, EMPTY_STATS_FILTERS, true).map((o) => o.label)).toEqual(['Beta', 'NoOwner', 'Zeta']);
    expect(utmOptionsFor(utms, EMPTY_STATS_FILTERS, false).map((o) => o.label)).toEqual(['Alpha']);
    expect(utmOptionsFor(utms, EMPTY_STATS_FILTERS, false)[0].color).toBe('#222');
  });

  it('utmOptionsFor: thu hẹp theo Quản lý chính/phụ đang chọn (giao)', () => {
    const f = { ...EMPTY_STATS_FILTERS, primaryManagerId: 10 };
    expect(utmOptionsFor(utms, f, true).map((o) => o.value)).toEqual([3, 1]);
    expect(utmOptionsFor(utms, { ...f, secondaryManagerId: 21 }, true).map((o) => o.value)).toEqual([1]);
    expect(utmOptionsFor(utms, f, false)).toEqual([]);
  });

  it('matchesManagers: UTM không có Quản lý chính không khớp khi đã chọn người', () => {
    expect(matchesManagers(utms[3], {})).toBe(true);
    expect(matchesManagers(utms[3], { primaryManagerId: 10 })).toBe(false);
  });

  it('pruneUtmSelection: đổi người quản lý -> bỏ UTM đang chọn không còn khớp', () => {
    const f = { primaryManagerId: 10, activeUtmIds: [1, 4], lockedUtmIds: [2] };
    expect(pruneUtmSelection(utms, f)).toEqual({ primaryManagerId: 10, activeUtmIds: [1], lockedUtmIds: [] });
  });

  it('mergedUtmIds: gộp 2 dropdown, khử trùng; không chọn -> undefined (không lọc)', () => {
    expect(mergedUtmIds({ activeUtmIds: [1, 3], lockedUtmIds: [2, 3] })).toEqual([1, 3, 2]);
    expect(mergedUtmIds(EMPTY_STATS_FILTERS)).toBeUndefined();
  });

  it('toStatsFilterParams + hasActiveStatsFilters', () => {
    const f = { primaryManagerId: 10, secondaryManagerId: 20, activeUtmIds: [1], lockedUtmIds: [] };
    expect(toStatsFilterParams(f)).toEqual({ utmIds: [1], primaryManagerId: 10, secondaryManagerId: 20 });
    expect(hasActiveStatsFilters(f)).toBe(true);
    expect(hasActiveStatsFilters(EMPTY_STATS_FILTERS)).toBe(false);
  });

  it('dropUnknownUtmIds: bỏ ID không còn/không đúng nhóm; không đổi thì trả CHÍNH object cũ (tránh render lặp)', () => {
    const same = { activeUtmIds: [1], lockedUtmIds: [2] };
    expect(dropUnknownUtmIds(utms, same)).toBe(same);
    // 2 là UTM khoá nhưng nằm ở nhóm hoạt động -> bỏ; 99 không tồn tại -> bỏ
    expect(dropUnknownUtmIds(utms, { activeUtmIds: [1, 2, 99], lockedUtmIds: [] })).toEqual({ activeUtmIds: [1], lockedUtmIds: [] });
  });
});

describe('Drill (bấm chart/card)', () => {
  const range = { from: '2026-06-15', to: '2026-09-20' };

  it('bucketRange: ngày = chính ngày đó', () => {
    expect(bucketRange('2026-09-05', range)).toEqual({ from: '2026-09-05', to: '2026-09-05' });
  });

  it('bucketRange: tháng giữa kỳ = cả tháng; tháng đầu/cuối kỳ bị cắt theo kỳ', () => {
    expect(bucketRange('2026-07', range)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(bucketRange('2026-06', range)).toEqual({ from: '2026-06-15', to: '2026-06-30' });
    expect(bucketRange('2026-09', range)).toEqual({ from: '2026-09-01', to: '2026-09-20' });
  });

  it('bucketRange: tháng 2 năm không nhuận', () => {
    expect(bucketRange('2026-02', { from: '2026-01-01', to: '2026-12-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('buildDrill: cột ngày + giai đoạn', () => {
    expect(buildDrill({ range, bucket: '2026-09-05', status: 'closed', statusName: 'Đã chốt' })).toEqual({
      title: 'Khách ngày 05/09/2026 — Đã chốt', from: '2026-09-05', to: '2026-09-05', status: 'closed',
    });
  });

  it('buildDrill: cột tháng', () => {
    expect(buildDrill({ range, bucket: '2026-07' }).title).toBe('Khách tháng 07/2026');
  });

  it('buildDrill: card tổng = cả kỳ; card trạng thái thiếu tên -> dùng mã', () => {
    expect(buildDrill({ range })).toEqual({ title: 'Khách 15/06/2026 – 20/09/2026', from: '2026-06-15', to: '2026-09-20', status: undefined });
    expect(buildDrill({ range, status: 'weird' }).title).toBe('Khách 15/06/2026 – 20/09/2026 — weird');
  });

  it('groupCustomerIdsByUtm: gom theo UTM, bỏ khách Thùng rác/không UTM/không còn trong bảng', () => {
    const rows = [
      { id: 1, utmId: 5 }, { id: 2, utmId: 5 }, { id: 3, utmId: 6 },
      { id: 4, utmId: null }, { id: 5, utmId: 5, deletedAt: '2026-09-01' },
    ];
    const g = groupCustomerIdsByUtm([1, 2, 3, 4, 5, 99], rows);
    expect([...g]).toEqual([[5, [1, 2]], [6, [3]]]);
  });
});

describe('rateLevel / rateColor (< 30 đỏ, 30–70 vàng, > 70 xanh)', () => {
  it('ranh giới', () => {
    expect(rateLevel(0)).toBe('low');
    expect(rateLevel(29.9)).toBe('low');
    expect(rateLevel(30)).toBe('mid');
    expect(rateLevel(70)).toBe('mid');
    expect(rateLevel(70.1)).toBe('high');
    expect(rateLevel(100)).toBe('high');
  });

  it('màu tương ứng', () => {
    expect(rateColor(10)).toBe(RATE_COLORS.low);
    expect(rateColor(50)).toBe(RATE_COLORS.mid);
    expect(rateColor(90)).toBe(RATE_COLORS.high);
  });

  it('dùng số đã làm tròn 1 chữ số như hiển thị (29,96 -> 30% -> vàng)', () => {
    expect(rateLevel(ratePct(2996, 10000))).toBe('mid');
  });
});
