import { describe, expect, it } from 'vitest';
import { getChainRunFlags, TaskChainInfo } from './taskLinkChains';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';

function fakeTask(id: number): PeriodicTask {
  return { id } as PeriodicTask;
}

function fakeChain(color: string): TaskChainInfo {
  return { chainId: 1, color, memberIds: [], index: 0 };
}

describe('getChainRunFlags', () => {
  it('Task không thuộc chuỗi nào -> không có mặt trong map', () => {
    const tasks = [fakeTask(1), fakeTask(2)];
    const chains = new Map<number, TaskChainInfo>();

    const result = getChainRunFlags(tasks, chains);

    expect(result.size).toBe(0);
  });

  it('run chỉ có 1 thành viên (dù có chain) -> không vẽ connector (coi như Task đơn lẻ)', () => {
    const tasks = [fakeTask(1), fakeTask(2)];
    const chains = new Map<number, TaskChainInfo>([[1, fakeChain('#fff')]]);

    const result = getChainRunFlags(tasks, chains);

    expect(result.size).toBe(0);
  });

  it('run >= 2 thành viên LIỀN NHAU -> gắn cờ isFirst/isLast đúng vị trí', () => {
    const tasks = [fakeTask(1), fakeTask(2), fakeTask(3), fakeTask(99)];
    const chains = new Map<number, TaskChainInfo>([
      [1, fakeChain('#abc')],
      [2, fakeChain('#abc')],
      [3, fakeChain('#abc')],
    ]);

    const result = getChainRunFlags(tasks, chains);

    expect(result.get(1)).toEqual({ color: '#abc', isFirst: true, isLast: false, depth: 0 });
    expect(result.get(2)).toEqual({ color: '#abc', isFirst: false, isLast: false, depth: 1 });
    expect(result.get(3)).toEqual({ color: '#abc', isFirst: false, isLast: true, depth: 2 });
    expect(result.has(99)).toBe(false);
  });

  it('2 run khác màu liền kề nhau -> tách 2 run riêng, không gộp chung', () => {
    const tasks = [fakeTask(1), fakeTask(2), fakeTask(3), fakeTask(4)];
    const chains = new Map<number, TaskChainInfo>([
      [1, fakeChain('#111')],
      [2, fakeChain('#111')],
      [3, fakeChain('#222')],
      [4, fakeChain('#222')],
    ]);

    const result = getChainRunFlags(tasks, chains);

    expect(result.get(1)).toEqual({ color: '#111', isFirst: true, isLast: false, depth: 0 });
    expect(result.get(2)).toEqual({ color: '#111', isFirst: false, isLast: true, depth: 1 });
    expect(result.get(3)).toEqual({ color: '#222', isFirst: true, isLast: false, depth: 0 });
    expect(result.get(4)).toEqual({ color: '#222', isFirst: false, isLast: true, depth: 1 });
  });
});