import { describe, it, expect } from 'vitest';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { groupTasksByAssignee, linkLabel, safeHttpUrl, sheetNameColor, SHEET_NAME_COLORS } from './taskSheet';

const mk = (id: number, assigneeId: number, name: string) => ({ id, primaryAssigneeId: assigneeId, primaryAssignee: { id: assigneeId, name } }) as unknown as PeriodicTask;

describe('groupTasksByAssignee', () => {
    it('gom theo người, nhóm sắp theo tên, giữ thứ tự Task trong nhóm', () => {
        const g = groupTasksByAssignee([mk(1, 2, 'Yến Thư'), mk(2, 1, 'Ngân Kim'), mk(3, 2, 'Yến Thư')]);
        expect(g.map((x) => x.assigneeName)).toEqual(['Ngân Kim', 'Yến Thư']);
        expect(g[1].tasks.map((t) => t.id)).toEqual([1, 3]);
    });
    it('rỗng -> rỗng', () => expect(groupTasksByAssignee([])).toEqual([]));
});

describe('linkLabel / safeHttpUrl', () => {
    it('nhãn: tên file nếu có đuôi, ngược lại tên miền', () => {
        expect(linkLabel('https://x.com/d/TAP_13.mp4')).toBe('TAP_13.mp4');
        expect(linkLabel('https://www.tiktok.com/@abc')).toBe('tiktok.com');
    });
    it('chỉ nhận http/https, còn lại / rỗng -> null', () => {
        expect(safeHttpUrl(' https://a.com/x ')).toBe('https://a.com/x');
        expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
        expect(safeHttpUrl('data:text/html,hi')).toBeNull();
        expect(safeHttpUrl('abc')).toBeNull();
        expect(safeHttpUrl('')).toBeNull();
        expect(safeHttpUrl(null)).toBeNull();
    });
});

describe('sheetNameColor', () => {
    it('ổn định theo id và nằm trong bảng màu', () => {
        expect(sheetNameColor(5)).toBe(sheetNameColor(5));
        expect(SHEET_NAME_COLORS).toContain(sheetNameColor(123));
    });
});
