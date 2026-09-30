import {
  addDays,
  aggregateUtmStats,
  buildBuckets,
  bucketKey,
  isValidDateStr,
  pickGranularity,
  spanDays,
} from './utm-stats.helper';

describe('utm-stats.helper', () => {
  it('isValidDateStr: bắt ngày sai định dạng / không tồn tại', () => {
    expect(isValidDateStr('2026-09-30')).toBe(true);
    expect(isValidDateStr('2026-02-30')).toBe(false);
    expect(isValidDateStr('30/09/2026')).toBe(false);
  });

  it('spanDays / addDays: gồm 2 đầu, qua tháng/năm nhuận', () => {
    expect(spanDays('2026-09-01', '2026-09-30')).toBe(30);
    expect(spanDays('2026-09-30', '2026-09-30')).toBe(1);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-09-30', -29)).toBe('2026-09-01');
  });

  it('pickGranularity: ≤ 92 ngày theo ngày, dài hơn theo tháng', () => {
    expect(pickGranularity('2026-07-01', '2026-09-30')).toBe('day'); // 92 ngày
    expect(pickGranularity('2026-06-30', '2026-09-30')).toBe('month'); // 93 ngày
  });

  it('buildBuckets: đủ mọi ngày (kể cả ngày 0 khách), tăng dần', () => {
    expect(buildBuckets('2026-09-28', '2026-10-01', 'day')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
  });

  it('buildBuckets: theo tháng không lặp bucket', () => {
    expect(buildBuckets('2026-07-15', '2026-10-02', 'month')).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(bucketKey('2026-09-05', 'month')).toBe('2026-09');
  });

  describe('aggregateUtmStats', () => {
    const buckets = buildBuckets('2026-09-28', '2026-09-30', 'day');
    const rows = [
      { date: '2026-09-28', utmId: 1, status: 'pending', cnt: 3 },
      { date: '2026-09-28', utmId: 1, status: 'closed', cnt: 1 },
      { date: '2026-09-30', utmId: 2, status: 'closed', cnt: 2 },
      { date: '2026-09-30', utmId: 2, status: 'legacy_x', cnt: 1 }, // status mồ côi
    ];
    const res = aggregateUtmStats(rows, ['pending', 'closed', 'lost'], buckets, 'day');

    it('tổng khớp cộng mọi dòng; status mồ côi được bổ sung cuối danh sách', () => {
      expect(res.totals.total).toBe(7);
      expect(res.statusCodes).toEqual(['pending', 'closed', 'lost', 'legacy_x']);
      expect(res.totals.byStatus).toEqual({ pending: 3, closed: 3, lost: 0, legacy_x: 1 });
    });

    it('series đủ 3 ngày, ngày giữa = 0; tổng các ngày = tổng chung', () => {
      expect(res.series.map((p) => p.total)).toEqual([4, 0, 3]);
      expect(res.series[1].byStatus).toEqual({ pending: 0, closed: 0, lost: 0, legacy_x: 0 });
      expect(res.series.reduce((a, p) => a + p.total, 0)).toBe(res.totals.total);
    });

    it('byUtm: sắp giảm dần theo tổng, mỗi UTM đủ mọi status', () => {
      expect(res.byUtm.map((u) => [u.utmId, u.total])).toEqual([[1, 4], [2, 3]]);
      expect(res.byUtm[0].byStatus.lost).toBe(0);
    });

    it('dòng ngoài dải bucket vẫn tính vào tổng nhưng không vào series (an toàn khi lệch dữ liệu)', () => {
      const r = aggregateUtmStats([{ date: '2026-10-05', utmId: 1, status: 'pending', cnt: 2 }], ['pending'], buckets, 'day');
      expect(r.totals.total).toBe(2);
      expect(r.series.reduce((a, p) => a + p.total, 0)).toBe(0);
    });

    it('không có dòng nào -> toàn 0, series vẫn đủ bucket', () => {
      const r = aggregateUtmStats([], ['pending'], buckets, 'day');
      expect(r.totals).toEqual({ total: 0, byStatus: { pending: 0 } });
      expect(r.series).toHaveLength(3);
      expect(r.byUtm).toEqual([]);
    });

    it('gom theo tháng', () => {
      const b = buildBuckets('2026-08-01', '2026-09-30', 'month');
      const r = aggregateUtmStats(
        [
          { date: '2026-08-31', utmId: 1, status: 'pending', cnt: 1 },
          { date: '2026-09-01', utmId: 1, status: 'pending', cnt: 2 },
        ],
        ['pending'],
        b,
        'month',
      );
      expect(r.series.map((p) => [p.date, p.total])).toEqual([['2026-08', 1], ['2026-09', 2]]);
    });
  });
});
