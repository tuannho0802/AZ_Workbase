import { UtmAccessHelper, UtmRelationContext } from './utm-access.helper';

const ctx = (over: Partial<UtmRelationContext> = {}): UtmRelationContext => ({
  userId: 10,
  primaryManagerId: 1,
  secondaryManagerUserIds: [2],
  primaryManagerDepartmentId: 5,
  managedDepartmentIds: [],
  ...over,
});

describe('UtmAccessHelper.relation', () => {
  it('scope null/none/undefined -> null kể cả là chính', () => {
    expect(UtmAccessHelper.relation(null, ctx({ userId: 1 }))).toBeNull();
    expect(UtmAccessHelper.relation('none', ctx({ userId: 1 }))).toBeNull();
    expect(UtmAccessHelper.relation(undefined, ctx({ userId: 1 }))).toBeNull();
  });
  it('scope all -> all (kể cả UTM chưa có chủ)', () => {
    expect(UtmAccessHelper.relation('all', ctx({ primaryManagerId: null }))).toBe('all');
  });
  it('scope own: chính / phụ / người ngoài', () => {
    expect(UtmAccessHelper.relation('own', ctx({ userId: 1 }))).toBe('primary');
    expect(UtmAccessHelper.relation('own', ctx({ userId: 2 }))).toBe('secondary');
    expect(UtmAccessHelper.relation('own', ctx())).toBeNull();
  });
  it('scope own KHÔNG mở theo phòng ban', () => {
    expect(UtmAccessHelper.relation('own', ctx({ managedDepartmentIds: [5] }))).toBeNull();
  });
  it('scope department: Quản lý chính cùng phòng ban quản lý -> department', () => {
    expect(UtmAccessHelper.relation('department', ctx({ managedDepartmentIds: [5] }))).toBe('department');
  });
  it('scope department: khác phòng ban -> null', () => {
    expect(UtmAccessHelper.relation('department', ctx({ managedDepartmentIds: [9] }))).toBeNull();
  });
  it('scope department: UTM chưa có chủ -> null', () => {
    expect(
      UtmAccessHelper.relation(
        'department',
        ctx({ primaryManagerId: null, primaryManagerDepartmentId: null, managedDepartmentIds: [5] }),
      ),
    ).toBeNull();
  });
  it('scope department: vẫn thao tác được UTM mình là chính/phụ dù khác phòng ban', () => {
    expect(UtmAccessHelper.relation('department', ctx({ userId: 1, managedDepartmentIds: [9] }))).toBe('primary');
    expect(UtmAccessHelper.relation('department', ctx({ userId: 2, managedDepartmentIds: [9] }))).toBe('secondary');
  });
});

describe('UtmAccessHelper quyền theo relation', () => {
  it.each([
    ['all', true, true, true, true],
    ['department', true, true, true, true],
    ['primary', true, true, true, true],
    ['secondary', false, true, false, false],
    [null, false, false, false, false],
  ] as const)('%s', (rel, identity, meta, secondary, del) => {
    expect(UtmAccessHelper.canEditIdentity(rel)).toBe(identity);
    expect(UtmAccessHelper.canEditMeta(rel)).toBe(meta);
    expect(UtmAccessHelper.canEditSecondaryManagers(rel)).toBe(secondary);
    expect(UtmAccessHelper.canDelete(rel)).toBe(del);
  });
  it('canUse: shared ai cũng dùng; restricted cần là thành viên hoặc view rộng', () => {
    expect(UtmAccessHelper.canUse('shared', false, null)).toBe(true);
    expect(UtmAccessHelper.canUse('restricted', false, null)).toBe(false);
    expect(UtmAccessHelper.canUse('restricted', true, null)).toBe(true);
    expect(UtmAccessHelper.canUse('restricted', false, 'all')).toBe(true);
    expect(UtmAccessHelper.canUse('restricted', false, 'department')).toBe(true);
    expect(UtmAccessHelper.canUse('restricted', false, 'primary')).toBe(false);
  });
  it('canViewManagers', () => {
    expect(UtmAccessHelper.canViewManagers(true, null)).toBe(true);
    expect(UtmAccessHelper.canViewManagers(false, 'department')).toBe(true);
    expect(UtmAccessHelper.canViewManagers(false, null)).toBe(false);
  });
});
