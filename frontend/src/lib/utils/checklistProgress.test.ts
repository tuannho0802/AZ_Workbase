import { describe, it, expect } from 'vitest';
import { getChecklistProgress, getChecklistTone } from './checklistProgress';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';

describe('getChecklistTone', () => {
    it('dưới 1 nửa -> đỏ (kể cả 0/N)', () => {
        expect(getChecklistTone({ done: 0, total: 3 })).toBe('red');
        expect(getChecklistTone({ done: 1, total: 3 })).toBe('red');
        expect(getChecklistTone({ done: 2, total: 5 })).toBe('red');
    });

    it('từ 1 nửa trở lên nhưng chưa xong -> vàng (đúng 50% cũng là vàng)', () => {
        expect(getChecklistTone({ done: 1, total: 2 })).toBe('gold');
        expect(getChecklistTone({ done: 2, total: 3 })).toBe('gold');
        expect(getChecklistTone({ done: 4, total: 5 })).toBe('gold');
    });

    it('xong đủ -> xanh lá', () => {
        expect(getChecklistTone({ done: 3, total: 3 })).toBe('green');
        expect(getChecklistTone({ done: 1, total: 1 })).toBe('green');
    });
});

describe('getChecklistProgress', () => {
    it('ưu tiên checklistProgress do BE đính ở danh sách', () => {
        expect(getChecklistProgress({ checklistProgress: { done: 2, total: 4 } })).toEqual({ done: 2, total: 4 });
    });

    it('null khi không có dữ liệu nào (vd response cũ) hoặc total = 0', () => {
        expect(getChecklistProgress({})).toBeNull();
        expect(getChecklistProgress({ checklistProgress: { done: 0, total: 0 } })).toBeNull();
        expect(getChecklistProgress({ checklistItems: [], linkedChildrenChecklist: [] })).toBeNull();
    });

    it('tự tính từ checklistItems + Task con liên kết khi task lấy từ GET /:id', () => {
        const result = getChecklistProgress({
            checklistItems: [{ isDone: true }, { isDone: false }] as unknown as PeriodicTask['checklistItems'],
            linkedChildrenChecklist: [{ isDone: true }] as unknown as PeriodicTask['linkedChildrenChecklist'],
        });
        expect(result).toEqual({ done: 2, total: 3 });
    });

    it('không cho done vượt total', () => {
        expect(getChecklistProgress({ checklistProgress: { done: 5, total: 3 } })).toEqual({ done: 3, total: 3 });
    });
});
