import { describe, expect, it } from 'vitest';
import type { MarketingUserRow } from '@/lib/types/reports.types';
import {
    countActiveFilters,
    deltaOf,
    filterUserRows,
    formatUsdCompact,
    pct,
    rowRates,
    sumRows,
    topRows,
    trendLabel,
    withOthers,
} from './marketingReport';

const row = (o: Partial<MarketingUserRow>): MarketingUserRow => ({
    userId: 1,
    userName: 'A',
    departmentId: 1,
    departmentName: 'Marketing',
    totalCustomers: 0,
    closedCustomers: 0,
    joinedGroupCustomers: 0,
    depositedCustomers: 0,
    revenue: 0,
    cohortDepositedCustomers: 0,
    byStatus: {},
    ...o,
});

describe('pct', () => {
    it('mẫu số 0 -> null, không NaN/Infinity', () => {
        expect(pct(5, 0)).toBeNull();
    });
    it('làm tròn 1 chữ số và chặn trần 100', () => {
        expect(pct(1, 3)).toBe(33.3);
        expect(pct(7, 5)).toBe(100);
    });
});

describe('deltaOf', () => {
    it('tăng/giảm/bằng', () => {
        expect(deltaOf(150, 100)).toEqual({ diff: 50, percent: 50, direction: 'up' });
        expect(deltaOf(50, 100)).toEqual({ diff: -50, percent: -50, direction: 'down' });
        expect(deltaOf(10, 10).direction).toBe('flat');
    });
    it('kỳ trước = 0 -> percent null (không chia 0)', () => {
        expect(deltaOf(5, 0)).toEqual({ diff: 5, percent: null, direction: 'up' });
    });
});

describe('formatUsdCompact', () => {
    it('K/M', () => {
        expect(formatUsdCompact(0)).toBe('$0');
        expect(formatUsdCompact(1500)).toBe('$1.5K');
        expect(formatUsdCompact(2_300_000)).toBe('$2.3M');
    });
});

describe('trendLabel', () => {
    it('ngày -> DD/MM, tháng -> MM/YYYY', () => {
        expect(trendLabel('2026-09-03', 'day')).toBe('03/09');
        expect(trendLabel('2026-09', 'month')).toBe('09/2026');
    });
});

describe('countActiveFilters', () => {
    it('0 (chưa gán) vẫn là bộ lọc đang bật; undefined thì không', () => {
        expect(countActiveFilters({})).toBe(0);
        expect(countActiveFilters({ marketingUserId: 0 })).toBe(1);
        expect(countActiveFilters({ marketingUserId: 7, source: 'Facebook', createdById: undefined })).toBe(2);
    });
});

describe('topRows', () => {
    it('bỏ dòng 0, sắp giảm dần, cắt N, không đổi mảng gốc', () => {
        const rows = [row({ userId: 1, revenue: 10 }), row({ userId: 2, revenue: 0 }), row({ userId: 3, revenue: 30 })];
        expect(topRows(rows, 'revenue', 5).map((r) => r.userId)).toEqual([3, 1]);
        expect(topRows(rows, 'revenue', 1).map((r) => r.userId)).toEqual([3]);
        expect(rows.map((r) => r.userId)).toEqual([1, 2, 3]);
    });
});

describe('withOthers', () => {
    it('gộp phần vượt maxSlices vào "Khác", giữ "chưa gán" riêng ở cuối, tổng khớp', () => {
        const rows = [
            row({ userId: 1, userName: 'A', revenue: 50 }),
            row({ userId: 2, userName: 'B', revenue: 30 }),
            row({ userId: 3, userName: 'C', revenue: 10 }),
            row({ userId: 0, userName: '(Chưa gán Marketing)', revenue: 5 }),
        ];
        const out = withOthers(rows, 'revenue', 2);
        expect(out).toEqual([
            { name: 'A', value: 50 },
            { name: 'B', value: 30 },
            { name: 'Khác', value: 10 },
            { name: '(Chưa gán Marketing)', value: 5 },
        ]);
        expect(out.reduce((s, x) => s + x.value, 0)).toBe(95);
    });
    it('không có phần dư -> không thêm "Khác"', () => {
        expect(withOthers([row({ userId: 1, revenue: 5 })], 'revenue', 6)).toEqual([{ name: 'A', value: 5 }]);
    });
});

describe('filterUserRows', () => {
    const rows = [
        row({ userId: 1, userName: 'Nguyễn Văn Đức', departmentId: 1, revenue: 10 }),
        row({ userId: 2, userName: 'Trần Mai', departmentId: 2, totalCustomers: 3 }),
        row({ userId: 3, userName: 'Lê Rỗng', departmentId: 1 }),
    ];
    it('tìm tên không dấu (đ -> d)', () => {
        expect(filterUserRows(rows, { search: 'duc' }).map((r) => r.userId)).toEqual([1]);
    });
    it('ẩn dòng toàn 0', () => {
        expect(filterUserRows(rows, { hideEmpty: true }).map((r) => r.userId)).toEqual([1, 2]);
    });
    it('lọc theo phòng ban NHÂN VIÊN', () => {
        expect(filterUserRows(rows, { staffDepartmentId: 1 }).map((r) => r.userId)).toEqual([1, 3]);
    });
});

describe('sumRows + rowRates', () => {
    it('cộng đủ 6 chỉ số; danh sách rỗng -> 0', () => {
        const s = sumRows([
            row({ totalCustomers: 10, revenue: 100, depositedCustomers: 2, cohortDepositedCustomers: 3 }),
            row({ totalCustomers: 5, revenue: 50.5, depositedCustomers: 1, cohortDepositedCustomers: 1 }),
        ]);
        expect(s).toMatchObject({ totalCustomers: 15, revenue: 150.5, depositedCustomers: 3, cohortDepositedCustomers: 4 });
        expect(sumRows([]).revenue).toBe(0);
    });
    it('tỷ lệ cohort và TB/khách nạp; null khi không có mẫu', () => {
        expect(rowRates(row({ totalCustomers: 10, cohortDepositedCustomers: 4, revenue: 300, depositedCustomers: 3 }))).toEqual({
            cohortDepositRate: 40,
            avgPerDepositor: 100,
        });
        expect(rowRates(row({}))).toEqual({ cohortDepositRate: null, avgPerDepositor: null });
    });
});
