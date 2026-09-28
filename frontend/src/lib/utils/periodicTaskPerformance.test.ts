import { describe, it, expect } from 'vitest';
import { aggregateRows } from './periodicTaskPerformance';
import type { PerformanceUserRow } from '../api/periodic-task-performance.api';

const base: PerformanceUserRow = {
  userId: 1, userName: 'A', total: 0, completedOnTime: 0, completedLate: 0, overdueNotCompleted: 0,
  pendingFuture: 0, completionRatePercent: null, lateRatePercent: null, inProgressCount: 0, inReviewCount: 0,
  inProgressRatePercent: null, inReviewRatePercent: null, checklistDone: 0, checklistTotal: 0,
  secondaryTotal: 0, checklistSecondaryDone: 0, checklistSecondaryTotal: 0,
};

describe('aggregateRows - Phụ trách phụ', () => {
  it('cộng secondaryTotal + checklist phụ, tách riêng khỏi total/checklist chính', () => {
    const t = aggregateRows([
      { ...base, total: 4, checklistDone: 2, checklistTotal: 4, secondaryTotal: 3, checklistSecondaryDone: 1, checklistSecondaryTotal: 5 },
      { ...base, userId: 2, total: 1, secondaryTotal: 2, checklistSecondaryDone: 4, checklistSecondaryTotal: 5 },
    ]);
    expect(t.total).toBe(5);
    expect(t.checklistTotal).toBe(4);
    expect(t.secondaryTotal).toBe(5);
    expect(t.checklistSecondaryDone).toBe(5);
    expect(t.checklistSecondaryTotal).toBe(10);
    expect(t.checklistSecondaryRatePercent).toBe(50);
  });
  it('checklistSecondaryRatePercent = null khi không có mục nào', () => {
    expect(aggregateRows([base]).checklistSecondaryRatePercent).toBeNull();
  });
});
