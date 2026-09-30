import { describe, expect, it } from 'vitest';
import {
  bucketLabel,
  bucketLabelFull,
  fmtPct,
  ratePct,
  sortUtmStatsRows,
  statusesWithData,
  toChartRows,
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
