import { describe, expect, it } from 'vitest';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { getAutoDensity } from './PeriodicTasksKanbanView';

const task = (progress?: { done: number; total: number }) => ({ id: 1, checklistProgress: progress }) as unknown as PeriodicTask;

describe('getAutoDensity (Kanban)', () => {
    it('chưa có checklist -> full', () => {
        expect(getAutoDensity(task())).toBe('full');
        expect(getAutoDensity(task({ done: 0, total: 0 }))).toBe('full');
    });
    it('dưới 50% -> full (nổi bật)', () => {
        expect(getAutoDensity(task({ done: 1, total: 3 }))).toBe('full');
        expect(getAutoDensity(task({ done: 0, total: 5 }))).toBe('full');
    });
    it('từ 50% đến dưới 100% -> compact', () => {
        expect(getAutoDensity(task({ done: 1, total: 2 }))).toBe('compact');
        expect(getAutoDensity(task({ done: 4, total: 5 }))).toBe('compact');
    });
    it('100% -> mini (thu gọn)', () => {
        expect(getAutoDensity(task({ done: 5, total: 5 }))).toBe('mini');
    });
});
