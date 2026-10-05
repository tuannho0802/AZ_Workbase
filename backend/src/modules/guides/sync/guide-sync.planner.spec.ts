import { createHash } from 'crypto';
import { GuideSpec } from './guide-file.parser';
import { DbGuideState, diffFields, hashSpec, planSync } from './guide-sync.planner';

const spec = (over: Partial<GuideSpec> = {}): GuideSpec => ({
  title: 'Khách hàng',
  slug: 'khach-hang',
  sortOrder: 10,
  published: true,
  roles: [],
  positions: [],
  departments: [],
  excludeRoles: [],
  excludePositions: [],
  excludeDepartments: [],
  permissions: [],
  content: 'Nội dung',
  ...over,
});
const db = (s: GuideSpec, sourceHash: string | null, id = 1): DbGuideState => ({ id, spec: s, sourceHash });

describe('hashSpec - loại trừ', () => {
  it('bài KHÔNG dùng loại trừ giữ nguyên hash định dạng cũ (không làm sourceHash đã lưu thành "sửa tay")', () => {
    const legacy = createHash('sha256')
      .update(JSON.stringify(['Khách hàng', 'khach-hang', 10, true, [], [], [], [], 'Nội dung']), 'utf8')
      .digest('hex');
    expect(hashSpec(spec())).toBe(legacy);
  });
  it('đổi loại trừ -> hash đổi; thứ tự danh sách loại trừ không ảnh hưởng', () => {
    expect(hashSpec(spec({ excludePositions: ['media'] }))).not.toBe(hashSpec(spec()));
    expect(hashSpec(spec({ excludeRoles: ['b', 'a'] }))).toBe(hashSpec(spec({ excludeRoles: ['a', 'b'] })));
  });
  it('loại trừ khác với "được xem" cùng giá trị (không nhầm 2 phía)', () => {
    expect(hashSpec(spec({ positions: ['media'] }))).not.toBe(hashSpec(spec({ excludePositions: ['media'] })));
  });
  it('chỉ khác loại trừ -> planSync = update (DB còn đúng như lần sync trước) và diffFields báo đúng trường', () => {
    const dbSpec = spec();
    const file = spec({ excludePositions: ['media'] });
    expect(diffFields(dbSpec, file)).toEqual(['excludePositions']);
    const plan = planSync([file], [db(dbSpec, hashSpec(dbSpec))]);
    expect(plan.actions[0]).toMatchObject({ kind: 'update', changed: ['excludePositions'] });
  });
});

describe('hashSpec', () => {
  it('không phụ thuộc thứ tự danh sách, CRLF hay khoảng trắng cuối', () => {
    const a = spec({ roles: ['b', 'a'], content: 'x\ny' });
    const b = spec({ roles: ['a', 'b'], content: 'x\r\ny\r\n\r\n' });
    expect(hashSpec(a)).toBe(hashSpec(b));
  });
  it('đổi bất kỳ trường nào -> hash đổi', () => {
    const base = hashSpec(spec());
    const variants: Array<Partial<GuideSpec>> = [
      { title: 'Khác' },
      { sortOrder: 11 },
      { published: false },
      { roles: ['admin'] },
      { positions: ['content'] },
      { departments: ['KD1'] },
      { permissions: ['customers.view'] },
      { content: 'Nội dung khác' },
    ];
    for (const v of variants) expect(hashSpec(spec(v))).not.toBe(base);
  });
});

describe('planSync', () => {
  it('chưa có trong DB -> create', () => {
    const f = spec();
    const { actions } = planSync([f], []);
    expect(actions).toEqual([{ kind: 'create', slug: 'khach-hang', file: f, fileHash: hashSpec(f) }]);
  });

  it('trùng nội dung + đã có hash gốc -> unchanged (không adopt)', () => {
    const f = spec();
    const h = hashSpec(f);
    expect(planSync([f], [db(f, h)]).actions[0]).toMatchObject({ kind: 'unchanged', adopt: false });
  });

  it('trùng nội dung nhưng chưa có hash gốc -> unchanged + adopt (để lần sau phát hiện được sửa tay)', () => {
    const f = spec();
    expect(planSync([f], [db(f, null)]).actions[0]).toMatchObject({ kind: 'unchanged', adopt: true });
  });

  it('file đổi, DB còn đúng như lần sync trước -> update (kèm trường đổi)', () => {
    const old = spec({ content: 'cũ' });
    const f = spec({ content: 'mới', title: 'Khách hàng 2' });
    const a = planSync([f], [db(old, hashSpec(old))]).actions[0];
    expect(a).toMatchObject({ kind: 'update', id: 1 });
    expect((a as { changed: string[] }).changed.sort()).toEqual(['content', 'title']);
  });

  it('file đổi, DB cũng bị sửa tay sau lần sync trước -> conflict', () => {
    const synced = spec({ content: 'bản sync' });
    const edited = spec({ content: 'bản sửa tay trên UI' });
    const f = spec({ content: 'bản file mới' });
    const a = planSync([f], [db(edited, hashSpec(synced))]).actions[0];
    expect(a).toMatchObject({ kind: 'conflict', neverSynced: false });
  });

  it('bài tạo tay trên UI (chưa từng sync) khác file -> conflict (neverSynced)', () => {
    const a = planSync([spec({ content: 'file' })], [db(spec({ content: 'ui' }), null)]).actions[0];
    expect(a).toMatchObject({ kind: 'conflict', neverSynced: true });
  });

  it('đổi audience (roles) cũng được coi là thay đổi', () => {
    const old = spec();
    const f = spec({ roles: ['admin'] });
    const a = planSync([f], [db(old, hashSpec(old))]).actions[0];
    expect(a).toMatchObject({ kind: 'update' });
    expect((a as { changed: string[] }).changed).toEqual(['roles']);
  });

  it('bài có trong DB mà không có file -> orphan, không có action xoá', () => {
    const other = spec({ slug: 'cu', title: 'Bài cũ' });
    const plan = planSync([spec()], [db(other, null, 7)]);
    expect(plan.orphans).toEqual([{ id: 7, slug: 'cu', title: 'Bài cũ' }]);
    expect(plan.actions.every((a) => a.kind === 'create')).toBe(true);
  });

  it('kết quả sắp theo slug (ổn định giữa các lần chạy)', () => {
    const plan = planSync([spec({ slug: 'b' }), spec({ slug: 'a' })], []);
    expect(plan.actions.map((a) => a.slug)).toEqual(['a', 'b']);
  });
});

describe('diffFields', () => {
  it('rỗng khi giống nhau (bỏ qua thứ tự list)', () => {
    expect(diffFields(spec({ roles: ['a', 'b'] }), spec({ roles: ['b', 'a'] }))).toEqual([]);
  });
});
