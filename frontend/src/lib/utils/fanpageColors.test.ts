import { describe, expect, it } from 'vitest';
import { ownerTagColor, sortOwnersPrimaryFirst } from './fanpageColors';

describe('ownerTagColor', () => {
    it('ổn định theo id và không dùng màu dành cho trạng thái', () => {
        expect(ownerTagColor(5)).toBe(ownerTagColor(5));
        for (let id = 0; id < 50; id++) expect(['green', 'default']).not.toContain(ownerTagColor(id));
    });
});

describe('sortOwnersPrimaryFirst', () => {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
    it('đưa người chính lên đầu, giữ thứ tự còn lại', () => {
        expect(sortOwnersPrimaryFirst(list, 3).map((o) => o.id)).toEqual([3, 1, 2]);
    });
    it('không có người chính / danh sách rỗng', () => {
        expect(sortOwnersPrimaryFirst(list, null)).toEqual(list);
        expect(sortOwnersPrimaryFirst(undefined, 1)).toEqual([]);
    });
});
