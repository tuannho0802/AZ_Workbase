import { describe, expect, it } from 'vitest';
import { shouldRefetchAfterChecklistChange, isPeriodicTaskListKey, patchTaskChecklistProgress } from './periodicTaskInvalidation';

describe('shouldRefetchAfterChecklistChange', () => {
  const T = 114;

  it('vẫn refetch danh sách (key thứ 2 là object params) để cập nhật nhãn X/Z + trạng thái', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', { page: 1, limit: 20 }], T)).toBe(true);
  });

  it('vẫn refetch trang checklist và detail', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'checklist-page', T, 1, 'position', false], T)).toBe(true);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'detail', T], T)).toBe(true);
  });

  it('KHÔNG refetch cấu trúc liên kết (links-among / children / parents)', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'links-among', [1, 2, 3]], T)).toBe(false);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'children', T], T)).toBe(false);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'parents', T], T)).toBe(false);
  });

  it('KHÔNG refetch Task con của CHÍNH task vừa tick, nhưng vẫn refetch Task con của task KHÁC (cha hiển thị tiến độ của nó)', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'linked-children-page', T, 1], T)).toBe(false);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'linked-children-page', 99, 1], T)).toBe(true);
  });

  it('9B-0: KHÔNG refetch rollup của CHÍNH task (BE chỉ đếm trạng thái Task con), nhưng vẫn refetch rollup của task KHÁC (Task cha)', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'rollup', T], T)).toBe(false);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'rollup', 99], T)).toBe(true);
  });
});

describe('9B-1 - isPeriodicTaskListKey / patchTaskChecklistProgress', () => {
  it('chỉ key danh sách (params là object) mới là list; detail/rollup/links-among/checklist-page thì không', () => {
    expect(isPeriodicTaskListKey(['periodic-tasks', { page: 1 }])).toBe(true);
    expect(isPeriodicTaskListKey(['periodic-tasks', 'detail', 1])).toBe(false);
    expect(isPeriodicTaskListKey(['periodic-tasks', 'rollup', 1])).toBe(false);
    expect(isPeriodicTaskListKey(['periodic-tasks', 'links-among', [1, 2]])).toBe(false);
    expect(isPeriodicTaskListKey(['periodic-tasks'])).toBe(false);
    expect(isPeriodicTaskListKey(['other', { page: 1 }])).toBe(false);
  });

  it('chỉ đổi đúng dòng khớp id, giữ nguyên field khác và tham chiếu dòng khác', () => {
    const other = { id: 2, checklistProgress: { done: 3, total: 3 } };
    const old = { total: 2, data: [{ id: 1, title: 'A', checklistProgress: { done: 0, total: 4 } }, other] };
    const next = patchTaskChecklistProgress(old, 1, { done: 1, total: 5 });
    expect(next.data[0]).toEqual({ id: 1, title: 'A', checklistProgress: { done: 1, total: 5 } });
    expect(next.data[1]).toBe(other);
    expect(next.total).toBe(2);
    expect(old.data[0].checklistProgress).toEqual({ done: 0, total: 4 }); // không mutate
  });

  it('không có dòng khớp / dữ liệu lạ -> trả CHÍNH old (không render thừa)', () => {
    const old = { data: [{ id: 2 }] };
    expect(patchTaskChecklistProgress(old, 1, { done: 1, total: 1 })).toBe(old);
    expect(patchTaskChecklistProgress(undefined, 1, { done: 1, total: 1 })).toBeUndefined();
    const weird = { items: [] };
    expect(patchTaskChecklistProgress(weird, 1, { done: 1, total: 1 })).toBe(weird);
  });
});
