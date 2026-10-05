import { GuideSpec } from './guide-file.parser';
import { DbGuideState, hashSpec } from './guide-sync.planner';
import { executeSync, SyncStore } from './guide-sync.executor';

const spec = (over: Partial<GuideSpec> = {}): GuideSpec => ({
  title: 'T',
  slug: 'a',
  sortOrder: 0,
  published: true,
  roles: [],
  positions: [],
  departments: [],
  excludeRoles: [],
  excludePositions: [],
  excludeDepartments: [],
  permissions: [],
  content: 'nội dung',
  ...over,
});

function fakeStore(dbGuides: DbGuideState[], opts: { badRefs?: string[] } = {}) {
  const calls: string[] = [];
  const store: SyncStore = {
    loadDbGuides: async () => dbGuides,
    assertRefsExist: async (s) => {
      if (opts.badRefs?.includes(s.slug)) throw new Error('không tồn tại trong DB: role "x"');
    },
    create: async (s) => {
      calls.push(`create:${s.slug}`);
      return { id: 100 };
    },
    update: async (id) => {
      calls.push(`update:${id}`);
    },
    setSourceHash: async (id, h) => {
      calls.push(`hash:${id}:${h.slice(0, 6)}`);
    },
  };
  return { store, calls };
}

describe('executeSync', () => {
  it('CHẠY THỬ: không gọi create/update/setSourceHash nào, vẫn báo kế hoạch', async () => {
    const old = spec({ slug: 'b', content: 'cũ' });
    const { store, calls } = fakeStore([{ id: 2, spec: old, sourceHash: hashSpec(old) }]);
    const r = await executeSync([spec(), spec({ slug: 'b', content: 'mới' })], store, { apply: false, force: false });
    expect(calls).toEqual([]);
    expect(r.items.map((i) => [i.slug, i.status, i.applied])).toEqual([
      ['a', 'create', false],
      ['b', 'update', false],
    ]);
    expect(r.hasProblems).toBe(false);
  });

  it('--apply: tạo mới + cập nhật rồi ghi hash gốc', async () => {
    const old = spec({ slug: 'b', content: 'cũ' });
    const { store, calls } = fakeStore([{ id: 2, spec: old, sourceHash: hashSpec(old) }]);
    const r = await executeSync([spec(), spec({ slug: 'b', content: 'mới' })], store, { apply: true, force: false });
    expect(calls).toEqual([`create:a`, `hash:100:${hashSpec(spec()).slice(0, 6)}`, 'update:2', `hash:2:${hashSpec(spec({ slug: 'b', content: 'mới' })).slice(0, 6)}`]);
    expect(r.items.every((i) => i.applied)).toBe(true);
  });

  it('xung đột: KHÔNG ghi đè, hasProblems = true; bài khác vẫn được xử lý', async () => {
    const edited = spec({ slug: 'b', content: 'sửa tay' });
    const { store, calls } = fakeStore([{ id: 2, spec: edited, sourceHash: 'hash-cu-khac' }]);
    const r = await executeSync([spec(), spec({ slug: 'b', content: 'file' })], store, { apply: true, force: false });
    expect(calls).toContain('create:a');
    expect(calls.some((c) => c.startsWith('update:'))).toBe(false);
    expect(r.items.find((i) => i.slug === 'b')).toMatchObject({ status: 'conflict', applied: false });
    expect(r.hasProblems).toBe(true);
  });

  it('--force: ghi đè bài xung đột', async () => {
    const edited = spec({ content: 'sửa tay' });
    const { store, calls } = fakeStore([{ id: 2, spec: edited, sourceHash: null }]);
    const r = await executeSync([spec({ content: 'file' })], store, { apply: true, force: true });
    expect(calls[0]).toBe('update:2');
    expect(r.items[0]).toMatchObject({ status: 'forced', applied: true });
    expect(r.hasProblems).toBe(false);
  });

  it('--force nhưng chạy thử: vẫn không ghi', async () => {
    const { store, calls } = fakeStore([{ id: 2, spec: spec({ content: 'ui' }), sourceHash: null }]);
    await executeSync([spec({ content: 'file' })], store, { apply: false, force: true });
    expect(calls).toEqual([]);
  });

  it('trùng nội dung nhưng thiếu hash gốc: --apply chỉ ghi hash (adopt), không update nội dung', async () => {
    const s = spec();
    const { store, calls } = fakeStore([{ id: 2, spec: s, sourceHash: null }]);
    const r = await executeSync([s], store, { apply: true, force: false });
    expect(calls).toEqual([`hash:2:${hashSpec(s).slice(0, 6)}`]);
    expect(r.items[0].status).toBe('adopt');
  });

  it('tham chiếu sai (role/permission không tồn tại): báo lỗi ngay cả khi chạy thử, không ghi bài đó', async () => {
    const { store, calls } = fakeStore([], { badRefs: ['a'] });
    const r = await executeSync([spec(), spec({ slug: 'b' })], store, { apply: true, force: false });
    expect(r.items.find((i) => i.slug === 'a')).toMatchObject({ status: 'error' });
    expect(calls).toContain('create:b');
    expect(calls).not.toContain('create:a');
    expect(r.hasProblems).toBe(true);
    const dry = await executeSync([spec()], fakeStore([], { badRefs: ['a'] }).store, { apply: false, force: false });
    expect(dry.items[0].status).toBe('error');
  });

  it('--only: chỉ xử lý slug được chọn và không liệt kê orphan', async () => {
    const other = spec({ slug: 'cu' });
    const { store, calls } = fakeStore([{ id: 9, spec: other, sourceHash: null }]);
    const r = await executeSync([spec(), spec({ slug: 'b' })], store, { apply: true, force: false, only: ['b'] });
    expect(calls).toEqual([`create:b`, `hash:100:${hashSpec(spec({ slug: 'b' })).slice(0, 6)}`]);
    expect(r.orphans).toEqual([]);
  });

  it('orphan chỉ được liệt kê, không bao giờ bị xoá', async () => {
    const { store, calls } = fakeStore([{ id: 9, spec: spec({ slug: 'cu', title: 'Cũ' }), sourceHash: null }]);
    const r = await executeSync([spec()], store, { apply: true, force: true });
    expect(r.orphans).toEqual([{ id: 9, slug: 'cu', title: 'Cũ' }]);
    expect(calls.some((c) => c.includes(':9'))).toBe(false);
  });
});
