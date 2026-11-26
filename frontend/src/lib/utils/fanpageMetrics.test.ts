import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { applyPaste, buildPeriod, formatPeriod, parsePasted } from './fanpageMetrics';

const TODAY = dayjs('2026-11-26'); // Thứ Năm

describe('buildPeriod', () => {
    it('ngày: kỳ 1 ngày -> periodStart null', () => {
        expect(buildPeriod('day', dayjs('2026-11-10'), undefined, TODAY)).toEqual({ date: '2026-11-10', periodStart: null });
    });
    it('tuần: Thứ Hai -> Chủ Nhật, chọn ngày bất kỳ trong tuần (kể cả Chủ Nhật)', () => {
        expect(buildPeriod('week', dayjs('2026-11-11'), undefined, TODAY)).toEqual({ date: '2026-11-15', periodStart: '2026-11-09' });
        expect(buildPeriod('week', dayjs('2026-11-15'), undefined, TODAY)).toEqual({ date: '2026-11-15', periodStart: '2026-11-09' });
        expect(buildPeriod('week', dayjs('2026-11-09'), undefined, TODAY)).toEqual({ date: '2026-11-15', periodStart: '2026-11-09' });
    });
    it('tuần chưa kết thúc: kẹp ngày cuối = hôm nay', () => {
        expect(buildPeriod('week', dayjs('2026-11-24'), undefined, TODAY)).toEqual({ date: '2026-11-26', periodStart: '2026-11-23' });
    });
    it('tuần mới có đúng 1 ngày (Thứ Hai là hôm nay) -> kỳ 1 ngày', () => {
        expect(buildPeriod('week', dayjs('2026-11-23'), undefined, dayjs('2026-11-23'))).toEqual({ date: '2026-11-23', periodStart: null });
    });
    it('tháng: mùng 1 -> cuối tháng; tháng hiện tại kẹp hôm nay', () => {
        expect(buildPeriod('month', dayjs('2026-10-17'), undefined, TODAY)).toEqual({ date: '2026-10-31', periodStart: '2026-10-01' });
        expect(buildPeriod('month', dayjs('2026-11-05'), undefined, TODAY)).toEqual({ date: '2026-11-26', periodStart: '2026-11-01' });
        expect(buildPeriod('month', dayjs('2026-02-10'), undefined, TODAY)).toEqual({ date: '2026-02-28', periodStart: '2026-02-01' });
    });
    it('tuỳ chọn: Từ–Đến; Từ = Đến -> kỳ 1 ngày; Đến ở tương lai bị kẹp', () => {
        expect(buildPeriod('range', dayjs('2026-11-01'), dayjs('2026-11-12'), TODAY)).toEqual({ date: '2026-11-12', periodStart: '2026-11-01' });
        expect(buildPeriod('range', dayjs('2026-11-12'), dayjs('2026-11-12'), TODAY)).toEqual({ date: '2026-11-12', periodStart: null });
        expect(buildPeriod('range', dayjs('2026-11-20'), dayjs('2026-12-31'), TODAY)).toEqual({ date: '2026-11-26', periodStart: '2026-11-20' });
    });
});

describe('formatPeriod', () => {
    it('1 ngày / kỳ nhiều ngày cùng năm / khác năm', () => {
        expect(formatPeriod('2026-11-15', null)).toBe('15/11/2026');
        expect(formatPeriod('2026-11-15', '2026-11-15')).toBe('15/11/2026');
        expect(formatPeriod('2026-11-15', '2026-11-09')).toBe('09/11 – 15/11/2026');
        expect(formatPeriod('2027-01-03', '2026-12-28')).toBe('28/12/2026 – 03/01/2027');
    });
});

describe('applyPaste (chỉ còn Follow + Lượt xem)', () => {
    it('cột thứ 3 trở đi bị bỏ (không còn Reach/Tương tác)', () => {
        const r = applyPaste(parsePasted('1.000\t500\t7\t8'), [1], 0, 0);
        expect(r.values.get(1)).toEqual({ followers: 1000, views: 500 });
    });
});
