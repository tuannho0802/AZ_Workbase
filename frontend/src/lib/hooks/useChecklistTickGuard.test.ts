import { describe, it, expect, beforeEach } from 'vitest';
import { getEffectiveStatusCode, markTaskStatusAfterTick, __resetStatusOverrides } from './useChecklistTickGuard';

const todo = { id: 1, title: 'T', status: { code: 'not_started' } };

describe('getEffectiveStatusCode - tránh hỏi lại "Bạn đang làm Task này?"', () => {
  beforeEach(() => __resetStatusOverrides());

  it('không có override -> theo props', () => {
    expect(getEffectiveStatusCode(todo)).toBe('not_started');
  });
  it('sau tick xác nhận: props còn cũ (not_started) vẫn coi là in_progress', () => {
    markTaskStatusAfterTick(todo, 'in_progress');
    expect(getEffectiveStatusCode(todo)).toBe('in_progress');
  });
  it('props đã mới (khác status cũ) -> bỏ override, tin props', () => {
    markTaskStatusAfterTick(todo, 'in_progress');
    expect(getEffectiveStatusCode({ ...todo, status: { code: 'in_progress' } })).toBe('in_progress');
    // Task bị chuyển lại To-do sau đó -> KHÔNG dính override cũ
    expect(getEffectiveStatusCode(todo)).toBe('not_started');
  });
  it('không truyền nextStatusCode -> không ghi override; Task khác không bị ảnh hưởng', () => {
    markTaskStatusAfterTick(todo, undefined);
    expect(getEffectiveStatusCode(todo)).toBe('not_started');
    markTaskStatusAfterTick(todo, 'in_progress');
    expect(getEffectiveStatusCode({ ...todo, id: 2 })).toBe('not_started');
  });
});
