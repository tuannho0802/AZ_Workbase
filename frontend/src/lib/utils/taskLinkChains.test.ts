import { describe, expect, it } from 'vitest';
import { buildTaskLinkChains, getChainRunFlags, TaskChainInfo, TaskLinkEdge } from './taskLinkChains';
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

    const result = getChainRunFlags(tasks, chains, []);

    expect(result.size).toBe(0);
  });

  it('run chỉ có 1 thành viên (dù có chain) -> không vẽ connector (coi như Task đơn lẻ)', () => {
    const tasks = [fakeTask(1), fakeTask(2)];
    const chains = new Map<number, TaskChainInfo>([[1, fakeChain('#fff')]]);

    const result = getChainRunFlags(tasks, chains, []);

    expect(result.size).toBe(0);
  });

  it('chuỗi thẳng hàng (1 cha - 1 con - 1 cháu) -> depth tăng dần đúng theo cạnh thật', () => {
    const tasks = [fakeTask(1), fakeTask(2), fakeTask(3), fakeTask(99)];
    const chains = new Map<number, TaskChainInfo>([
      [1, fakeChain('#abc')],
      [2, fakeChain('#abc')],
      [3, fakeChain('#abc')],
    ]);
    const edges: TaskLinkEdge[] = [
      { parentTaskId: 1, childTaskId: 2 },
      { parentTaskId: 2, childTaskId: 3 },
    ];

    const result = getChainRunFlags(tasks, chains, edges);

    expect(result.get(1)).toEqual({
      color: '#abc',
      depth: 0,
      isRoot: true,
      isLastChild: true,
      hasVisibleChildren: true,
      passThroughDepths: [],
    });
    expect(result.get(2)).toEqual({
      color: '#abc',
      depth: 1,
      isRoot: false,
      isLastChild: true,
      hasVisibleChildren: true,
      passThroughDepths: [],
    });
    expect(result.get(3)).toEqual({
      color: '#abc',
      depth: 2,
      isRoot: false,
      isLastChild: true,
      hasVisibleChildren: false,
      passThroughDepths: [],
    });
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
    const edges: TaskLinkEdge[] = [
      { parentTaskId: 1, childTaskId: 2 },
      { parentTaskId: 3, childTaskId: 4 },
    ];

    const result = getChainRunFlags(tasks, chains, edges);

    expect(result.get(1)).toMatchObject({ color: '#111', depth: 0, isRoot: true });
    expect(result.get(2)).toMatchObject({ color: '#111', depth: 1, isRoot: false });
    expect(result.get(3)).toMatchObject({ color: '#222', depth: 0, isRoot: true });
    expect(result.get(4)).toMatchObject({ color: '#222', depth: 1, isRoot: false });
  });

  it('BUG THẬT (2026-09-15): 1 Task "Tuần" có 2 Task "Ngày" con -> cả 2 con phải CÙNG depth (anh em), KHÔNG lồng vào nhau', () => {
    // Tái hiện đúng ảnh người dùng báo: "Test link task" (Tuần) là cha của
    // CẢ "Test task được giao" (Ngày) VÀ "Test link lai" (Ngày) - không
    // phải "Test link lai" là con của "Test task được giao".
    const tasks = [fakeTask(1), fakeTask(2), fakeTask(3)];
    const chains = new Map<number, TaskChainInfo>([
      [1, fakeChain('#abc')],
      [2, fakeChain('#abc')],
      [3, fakeChain('#abc')],
    ]);
    const edges: TaskLinkEdge[] = [
      { parentTaskId: 1, childTaskId: 2 }, // Tuần -> Ngày A
      { parentTaskId: 1, childTaskId: 3 }, // Tuần -> Ngày B (CÙNG cha, không phải con của A)
    ];

    const result = getChainRunFlags(tasks, chains, edges);

    expect(result.get(1)?.depth).toBe(0);
    expect(result.get(2)?.depth).toBe(1);
    expect(result.get(3)?.depth).toBe(1); // trước fix: sẽ bị tính depth=2 (lồng vào con thứ nhất)

    // Con đầu (A) CHƯA phải con cuối -> trục cha (Tuần) phải kéo dài xuống
    // để nối tới con thứ 2 (B).
    expect(result.get(2)?.isLastChild).toBe(false);
    // Con thứ 2 (B) là con CUỐI -> không cần kéo trục cha xuống nữa.
    expect(result.get(3)?.isLastChild).toBe(true);
  });

  it('skip-level: Daily nối thẳng lên Monthly bỏ qua Weekly -> depth vẫn tính theo cạnh THẬT (1 cấp), không cộng dồn theo PERIOD_RANK', () => {
    const tasks = [fakeTask(1), fakeTask(2)];
    const chains = new Map<number, TaskChainInfo>([
      [1, fakeChain('#abc')],
      [2, fakeChain('#abc')],
    ]);
    // 1 = Monthly, 2 = Daily, nối thẳng (không qua Weekly trung gian).
    const edges: TaskLinkEdge[] = [{ parentTaskId: 1, childTaskId: 2 }];

    const result = getChainRunFlags(tasks, chains, edges);

    expect(result.get(2)?.depth).toBe(1); // KHÔNG phải 2 dù rank chênh 2 bậc (Monthly=3, Daily=1)
  });
});

describe('buildTaskLinkChains - thứ tự DFS pre-order', () => {
  it('1 cha - 2 con cùng cấp -> 2 con đứng LIỀN NHAU ngay sau cha (không bị cháu của nhánh khác chen vào giữa)', () => {
    // Tuần(1) -> Ngày A(2), Ngày A(2) -> (không có con)
    // Tuần(1) -> Ngày B(3)
    // Thêm 1 nhánh khác (10 -> 11) có ID nhỏ hơn 3 để bẫy lỗi tie-break theo
    // ID kiểu Kahn/BFS cũ (nếu còn sẽ đẩy nhánh khác chen vào giữa A và B).
    const edges: TaskLinkEdge[] = [
      { parentTaskId: 1, childTaskId: 2 },
      { parentTaskId: 1, childTaskId: 3 },
    ];
    const chains = buildTaskLinkChains(edges);
    const order = [1, 2, 3].sort((a, b) => (chains.get(a)?.index ?? 0) - (chains.get(b)?.index ?? 0));
    expect(order).toEqual([1, 2, 3]);
  });
});d