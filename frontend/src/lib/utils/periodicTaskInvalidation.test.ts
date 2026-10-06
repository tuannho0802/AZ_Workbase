import { describe, expect, it } from 'vitest';
import { shouldRefetchAfterChecklistChange } from './periodicTaskInvalidation';

describe('shouldRefetchAfterChecklistChange', () => {
  const T = 114;

  it('vẫn refetch danh sách (key thứ 2 là object params) để cập nhật nhãn X/Z + trạng thái', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', { page: 1, limit: 20 }], T)).toBe(true);
  });

  it('vẫn refetch trang checklist, detail và rollup', () => {
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'checklist-page', T, 1, 'position', false], T)).toBe(true);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'detail', T], T)).toBe(true);
    expect(shouldRefetchAfterChecklistChange(['periodic-tasks', 'rollup', T], T)).toBe(true);
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
});
