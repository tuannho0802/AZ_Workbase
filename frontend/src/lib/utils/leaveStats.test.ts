import { describe, expect, it } from 'vitest';
import type { LeaveDepartmentStat, LeaveEmployeeStat } from '../types/leave-stats.types';
import { MAX_DRILL_USER_IDS, bucketLabel, departmentSeries, filterEmployees, fmtDays, frequencyUserIds, topEmployees, typeSlices } from './leaveStats';
import { normalizeText } from './marketingReport';

const emp = (o: Partial<LeaveEmployeeStat> & { userId: number }): LeaveEmployeeStat => ({
    userName: `NV ${o.userId}`,
    departmentName: 'Sales',
    requests: 1,
    requestedDays: 1,
    approvedDays: 1,
    pending: 0,
    approved: 1,
    rejected: 0,
    supplementary: 0,
    approvalRate: 100,
    ...o,
});
const dept = (o: Partial<LeaveDepartmentStat> & { departmentName: string }): LeaveDepartmentStat => ({
    departmentId: 1,
    headcount: 10,
    requests: 1,
    requestedDays: 1,
    approvedDays: 1,
    employees: 1,
    participationRate: 10,
    avgApprovedDaysPerHead: 0.1,
    ...o,
});

describe('leaveStats utils', () => {
    it('fmtDays: null -> "—", bỏ số 0 thừa, giữ phần lẻ', () => {
        expect(fmtDays(null)).toBe('—');
        expect(fmtDays(undefined)).toBe('—');
        expect(fmtDays(2)).toBe('2');
        expect(fmtDays(0.5)).toBe('0,5');
        expect(fmtDays(0.833333)).toBe('0,83');
    });

    it('bucketLabel theo ngày/tháng', () => {
        expect(bucketLabel('2026-09-10', 'day')).toBe('10/09');
        expect(bucketLabel('2026-09', 'month')).toBe('09/2026');
    });

    it('topEmployees: bỏ dòng 0, giảm dần, giới hạn N, hoà điểm giữ thứ tự gốc, không đổi mảng gốc', () => {
        const rows = [
            emp({ userId: 1, approvedDays: 2 }),
            emp({ userId: 2, approvedDays: 0 }),
            emp({ userId: 3, approvedDays: 5 }),
            emp({ userId: 4, approvedDays: 2 }),
        ];
        const copy = [...rows];
        const top = topEmployees(rows, 'approvedDays', 3);
        expect(top.map((t) => t.row.userId)).toEqual([3, 1, 4]);
        expect(top[0]).toMatchObject({ name: 'NV 3', value: 5 });
        expect(rows).toEqual(copy);
        expect(topEmployees(rows, 'approvedDays', 1)).toHaveLength(1);
    });

    it('departmentSeries: null coi như 0, sắp giảm dần theo chỉ số chọn', () => {
        const rows = [
            dept({ departmentName: 'A', participationRate: null, requests: 9 }),
            dept({ departmentName: 'B', participationRate: 50 }),
            dept({ departmentName: 'C', participationRate: 20 }),
        ];
        expect(departmentSeries(rows, 'participationRate').map((d) => d.name)).toEqual(['B', 'C', 'A']);
        expect(departmentSeries(rows, 'requests')[0].name).toBe('A');
        expect(departmentSeries(rows, 'participationRate', 2)).toHaveLength(2);
    });

    it('filterEmployees: tìm theo tên/phòng ban không phân biệt hoa thường và dấu', () => {
        const rows = [emp({ userId: 1, userName: 'Nguyễn Văn An', departmentName: 'Kinh doanh' }), emp({ userId: 2, userName: 'Bình', departmentName: 'IT' })];
        expect(filterEmployees(rows, '', normalizeText)).toHaveLength(2);
        expect(filterEmployees(rows, 'nguyen van', normalizeText).map((r) => r.userId)).toEqual([1]);
        expect(filterEmployees(rows, 'kinh DOANH', normalizeText).map((r) => r.userId)).toEqual([1]);
        expect(filterEmployees(rows, 'zzz', normalizeText)).toEqual([]);
    });

    it('typeSlices: bỏ loại 0 đơn, dùng tên + màu truyền vào', () => {
        const s = typeSlices(
            [
                { code: 'annual', requests: 3, requestedDays: 3, approvedDays: 2, employees: 2 },
                { code: 'sick', requests: 0, requestedDays: 0, approvedDays: 0, employees: 0 },
            ],
            (c) => c.toUpperCase(),
            (_c, i) => `#00000${i}`,
        );
        expect(s).toEqual([{ code: 'annual', name: 'ANNUAL', value: 3, color: '#000000' }]);
    });
});

describe('frequencyUserIds', () => {
    const emp = (userId: number, requests: number) => ({ userId, requests }) as LeaveEmployeeStat;
    const list = [emp(1, 1), emp(2, 2), emp(3, 3), emp(4, 4), emp(5, 5), emp(6, 9), emp(7, 0)];

    it('gom đúng người theo từng cột tần suất', () => {
        expect(frequencyUserIds('1', list)).toEqual([1]);
        expect(frequencyUserIds('2', list)).toEqual([2]);
        expect(frequencyUserIds('3-4', list)).toEqual([3, 4]);
        expect(frequencyUserIds('5+', list)).toEqual([5, 6]);
    });

    it('cột 0 hoặc khoá lạ -> rỗng; cắt tối đa MAX_DRILL_USER_IDS', () => {
        expect(frequencyUserIds('0', list)).toEqual([]);
        expect(frequencyUserIds('x', list)).toEqual([]);
        const many = Array.from({ length: 150 }, (_, i) => emp(i + 1, 1));
        expect(frequencyUserIds('1', many)).toHaveLength(MAX_DRILL_USER_IDS);
    });
});
