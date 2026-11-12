import {
    buildGrowthBuckets,
    buildGrowthSeries,
    buildHeatmap,
    bucketPostsByWeek,
    carryForward,
    hasAnyMetric,
    isSuspiciousDrop,
    isValidMonth,
    latestFollowerMetric,
    monthEnd,
    pickGrowthGroupBy,
    postInteractions,
    resolveStatsRange,
    validateSnapshot,
    windowGain,
} from './fanpage-metrics.helper';

const rows = (...pairs: Array<[string, number]>) => pairs.map(([date, value]) => ({ date, value }));

describe('fanpage-metrics.helper', () => {
    describe('tháng / kỳ', () => {
        it('isValidMonth', () => {
            expect(isValidMonth('2026-11')).toBe(true);
            expect(isValidMonth('2026-13')).toBe(false);
            expect(isValidMonth('2026-00')).toBe(false);
            expect(isValidMonth('2026-1')).toBe(false);
        });
        it('monthEnd xử lý tháng 2 nhuận/không nhuận và tháng 12', () => {
            expect(monthEnd('2028-02')).toBe('2028-02-29');
            expect(monthEnd('2026-02')).toBe('2026-02-28');
            expect(monthEnd('2026-12')).toBe('2026-12-31');
        });
        it('resolveStatsRange: mặc định 30 ngày gồm hôm nay', () => {
            expect(resolveStatsRange(undefined, undefined, '2026-11-12')).toEqual({ ok: true, from: '2026-10-14', to: '2026-11-12' });
        });
        it('resolveStatsRange: chặn tương lai, đảo ngược, quá 366 ngày, ngày sai', () => {
            expect(resolveStatsRange('2026-11-01', '2026-11-20', '2026-11-12').ok).toBe(false);
            expect(resolveStatsRange('2026-11-10', '2026-11-01', '2026-11-12').ok).toBe(false);
            expect(resolveStatsRange('2025-01-01', '2026-11-12', '2026-11-12').ok).toBe(false);
            expect(resolveStatsRange('2026-02-30', '2026-03-01', '2026-11-12').ok).toBe(false);
            expect(resolveStatsRange('2025-11-12', '2026-11-12', '2026-11-12').ok).toBe(true); // đúng 366 ngày
        });
        it('pickGrowthGroupBy: >92 ngày -> tháng', () => {
            expect(pickGrowthGroupBy('2026-11-01', '2026-11-12')).toBe('week');
            expect(pickGrowthGroupBy('2026-01-01', '2026-11-12')).toBe('month');
        });
    });

    describe('validateSnapshot', () => {
        const today = '2026-11-12';
        it('hợp lệ', () => expect(validateSnapshot('2026-11-12', { followers: 10 }, today)).toBeNull());
        it('ngày tương lai / sai', () => {
            expect(validateSnapshot('2026-11-13', { followers: 1 }, today)).toMatch(/tương lai/);
            expect(validateSnapshot('2026-02-30', { followers: 1 }, today)).toMatch(/không hợp lệ/);
        });
        it('số âm, thập phân, quá lớn', () => {
            expect(validateSnapshot('2026-11-12', { followers: -1 }, today)).toMatch(/không âm/);
            expect(validateSnapshot('2026-11-12', { reach: 1.5 }, today)).toMatch(/không âm/);
            expect(validateSnapshot('2026-11-12', { views: 3_000_000_000 }, today)).toMatch(/quá lớn/);
        });
        it('rỗng hoàn toàn bị chặn, số 0 hợp lệ', () => {
            expect(validateSnapshot('2026-11-12', {}, today)).toMatch(/ít nhất 1/);
            expect(validateSnapshot('2026-11-12', { followers: null }, today)).toMatch(/ít nhất 1/);
            expect(validateSnapshot('2026-11-12', { followers: 0 }, today)).toBeNull();
            expect(hasAnyMetric({ reach: 0 })).toBe(true);
        });
    });

    describe('isSuspiciousDrop', () => {
        it('giảm đúng 50% chưa bị coi là nghi, dưới 50% thì có', () => {
            expect(isSuspiciousDrop(1000, 500)).toBe(false);
            expect(isSuspiciousDrop(1000, 499)).toBe(true);
        });
        it('thiếu lần trước / lần trước = 0 / tăng -> không nghi', () => {
            expect(isSuspiciousDrop(null, 5)).toBe(false);
            expect(isSuspiciousDrop(0, 0)).toBe(false);
            expect(isSuspiciousDrop(100, 900)).toBe(false);
            expect(isSuspiciousDrop(100, null)).toBe(false);
        });
    });

    describe('carryForward / latestFollowerMetric', () => {
        const r = rows(['2026-11-01', 100], ['2026-11-08', 130]);
        it('lấy giá trị gần nhất <= ngày', () => {
            expect(carryForward(r, '2026-10-31')).toBeNull();
            expect(carryForward(r, '2026-11-01')?.value).toBe(100);
            expect(carryForward(r, '2026-11-07')?.value).toBe(100);
            expect(carryForward(r, '2026-11-12')?.value).toBe(130);
        });
        it('delta kèm số ngày cách nhau', () => {
            expect(latestFollowerMetric(r[1], r[0])).toEqual({ date: '2026-11-08', followers: 130, delta: 30, deltaDays: 7 });
        });
        it('chỉ 1 lần nhập -> chưa có delta; không có -> null', () => {
            expect(latestFollowerMetric(r[0], null)).toEqual({ date: '2026-11-01', followers: 100, delta: null, deltaDays: null });
            expect(latestFollowerMetric(null, null)).toBeNull();
        });
        it('delta âm được giữ nguyên', () => {
            expect(latestFollowerMetric({ date: '2026-11-08', value: 90 }, { date: '2026-11-01', value: 100 })?.delta).toBe(-10);
        });
    });

    describe('windowGain', () => {
        it('dùng mốc gần nhất TRƯỚC kỳ làm nền', () => {
            const r = rows(['2026-09-20', 1000], ['2026-10-20', 1100], ['2026-11-10', 1250]);
            expect(windowGain(r, '2026-10-14', '2026-11-12')).toEqual({ gain: 250, baselineDate: '2026-09-20', latestDate: '2026-11-10' });
        });
        it('chưa có mốc trước kỳ -> lấy lần nhập đầu trong kỳ', () => {
            const r = rows(['2026-10-20', 1100], ['2026-11-10', 1250]);
            expect(windowGain(r, '2026-10-14', '2026-11-12')).toEqual({ gain: 150, baselineDate: '2026-10-20', latestDate: '2026-11-10' });
        });
        it('chỉ 1 lần nhập (mốc đầu = mốc cuối) hoặc không có -> null', () => {
            expect(windowGain(rows(['2026-11-10', 1250]), '2026-10-14', '2026-11-12')).toBeNull();
            expect(windowGain([], '2026-10-14', '2026-11-12')).toBeNull();
        });
        it('chỉ có dữ liệu SAU kỳ -> null', () => {
            expect(windowGain(rows(['2026-12-01', 5]), '2026-10-14', '2026-11-12')).toBeNull();
        });
        it('gain âm khi follower giảm', () => {
            expect(windowGain(rows(['2026-10-01', 500], ['2026-11-01', 480]), '2026-10-14', '2026-11-12')?.gain).toBe(-20);
        });
    });

    describe('buildGrowthBuckets', () => {
        it('tuần: bắt đầu từ Thứ Hai chứa from, bucket cuối cắt theo to', () => {
            // 2026-11-12 = Thứ Năm; tuần chứa nó bắt đầu 2026-11-09.
            const b = buildGrowthBuckets('2026-11-03', '2026-11-12', 'week');
            expect(b).toEqual([
                { key: '2026-11-02', end: '2026-11-08' },
                { key: '2026-11-09', end: '2026-11-12' },
            ]);
        });
        it('tháng: đủ mọi tháng kể cả qua năm, tháng cuối cắt theo to', () => {
            expect(buildGrowthBuckets('2026-11-15', '2027-01-10', 'month')).toEqual([
                { key: '2026-11', end: '2026-11-30' },
                { key: '2026-12', end: '2026-12-31' },
                { key: '2027-01', end: '2027-01-10' },
            ]);
        });
    });

    describe('buildGrowthSeries (carry-forward + Page chưa có số liệu)', () => {
        const buckets = buildGrowthBuckets('2026-11-03', '2026-11-12', 'week');
        const pages = [
            { id: 1, rows: rows(['2026-10-30', 100], ['2026-11-10', 120]) },
            { id: 2, rows: rows(['2026-11-09', 50]) },
            { id: 3, rows: [] },
        ];
        const s = buildGrowthSeries(pages, buckets, new Set([1, 2]));
        it('tổng carry-forward theo bucket, Page chưa có dữ liệu bị bỏ (không coi là 0)', () => {
            expect(s.points).toEqual([
                { key: '2026-11-02', total: 100, pagesWithData: 1 }, // P2 chưa có, P3 không có
                { key: '2026-11-09', total: 170, pagesWithData: 2 }, // 120 + 50
            ]);
        });
        it('đếm Page chưa có số liệu nào tới hết kỳ', () => {
            expect(s.pagesWithoutMetrics).toBe(1);
        });
        it('chuỗi từng Page chỉ cho Page được yêu cầu, null khi chưa có số liệu', () => {
            expect(s.perPage).toEqual([
                { id: 1, values: [100, 120] },
                { id: 2, values: [null, 50] },
            ]);
        });
    });

    describe('bucketPostsByWeek / heatmap / postInteractions', () => {
        it('đủ mọi tuần kể cả 0 bài, bỏ ngày ngoài kỳ', () => {
            const out = bucketPostsByWeek(
                [
                    { date: '2026-11-02', count: 2 },
                    { date: '2026-11-08', count: 1 }, // CN cùng tuần với 11-02
                    { date: '2026-11-12', count: 3 },
                    { date: '2026-10-01', count: 9 }, // ngoài kỳ
                ],
                '2026-10-26',
                '2026-11-12',
            );
            expect(out.map((w) => [w.weekStart, w.count])).toEqual([
                ['2026-10-26', 0],
                ['2026-11-02', 3],
                ['2026-11-09', 3],
            ]);
        });
        it('heatmap: đủ weeks*7 ô, kết thúc Chủ Nhật của tuần hiện tại, ô sau hôm nay đánh dấu future', () => {
            const h = buildHeatmap([{ date: '2026-11-12', count: 2 }], '2026-11-12', 2);
            expect(h.from).toBe('2026-11-02');
            expect(h.to).toBe('2026-11-15');
            expect(h.cells).toHaveLength(14);
            expect(h.cells.find((c) => c.date === '2026-11-12')).toEqual({ date: '2026-11-12', count: 2, future: false });
            expect(h.cells.find((c) => c.date === '2026-11-13')?.future).toBe(true);
            expect(h.cells[0].date).toBe('2026-11-02'); // luôn bắt đầu Thứ Hai
        });
        it('heatmap: kẹp số tuần 1..52', () => {
            expect(buildHeatmap([], '2026-11-12', 0).weeks).toBe(1);
            expect(buildHeatmap([], '2026-11-12', 999).weeks).toBe(52);
        });
        it('postInteractions chỉ cộng số đã nhập', () => {
            expect(postInteractions({ likes: 5, comments: null, shares: 2 })).toBe(7);
            expect(postInteractions({ likes: null, comments: null, shares: null })).toBe(0);
        });
    });
});