import { GuideAccessHelper } from './guide-access.helper';

const viewer = (
  roleId: number | null,
  positionId: number | null = null,
  departmentId: number | null = null,
  granted: string[] = [],
) => ({
  roleId,
  positionId,
  departmentId,
  grantedPermissionKeys: new Set(granted),
});

describe('GuideAccessHelper.canView', () => {
  it('bản nháp: không ai xem được qua đường xem (kể cả người có guides.manage)', () => {
    expect(GuideAccessHelper.canView({ isPublished: false, assignedRoleIds: [] }, viewer(1), false)).toBe(false);
    expect(GuideAccessHelper.canView({ isPublished: false, assignedRoleIds: [] }, viewer(1), true)).toBe(false);
  });
  it('đã xuất bản + không gán gì: mọi người xem được', () => {
    expect(GuideAccessHelper.canView({ isPublished: true, assignedRoleIds: [] }, viewer(4), false)).toBe(true);
    expect(GuideAccessHelper.canView({ isPublished: true, assignedRoleIds: [] }, viewer(null), false)).toBe(true);
  });
  it('có gán role: chỉ role trong danh sách', () => {
    const g = { isPublished: true, assignedRoleIds: [2, 3] };
    expect(GuideAccessHelper.canView(g, viewer(2), false)).toBe(true);
    expect(GuideAccessHelper.canView(g, viewer(4), false)).toBe(false);
    expect(GuideAccessHelper.canView(g, viewer(null), false)).toBe(false);
  });
  it('có gán vị trí: chỉ vị trí trong danh sách; người không có vị trí bị chặn', () => {
    const g = { isPublished: true, assignedRoleIds: [], assignedPositionIds: [7, 8] };
    expect(GuideAccessHelper.canView(g, viewer(4, 7), false)).toBe(true);
    expect(GuideAccessHelper.canView(g, viewer(4, 9), false)).toBe(false);
    expect(GuideAccessHelper.canView(g, viewer(4, null), false)).toBe(false);
  });
  it('có gán phòng ban: chỉ phòng ban trong danh sách; người không thuộc phòng ban nào bị chặn', () => {
    const g = { isPublished: true, assignedRoleIds: [], assignedDepartmentIds: [5] };
    expect(GuideAccessHelper.canView(g, viewer(4, null, 5), false)).toBe(true);
    expect(GuideAccessHelper.canView(g, viewer(4, null, 6), false)).toBe(false);
    expect(GuideAccessHelper.canView(g, viewer(4, null, null), false)).toBe(false);
  });
  it('AND giữa các chiều: phải thoả TẤT CẢ chiều đã gán', () => {
    const g = { isPublished: true, assignedRoleIds: [4], assignedPositionIds: [7], assignedDepartmentIds: [5] };
    expect(GuideAccessHelper.canView(g, viewer(4, 7, 5), false)).toBe(true);
    expect(GuideAccessHelper.canView(g, viewer(4, 7, 6), false)).toBe(false);
    expect(GuideAccessHelper.canView(g, viewer(4, 9, 5), false)).toBe(false);
    expect(GuideAccessHelper.canView(g, viewer(2, 7, 5), false)).toBe(false);
  });
  it('chiều rỗng KHÔNG chặn dù người xem không có giá trị đó', () => {
    const g = { isPublished: true, assignedRoleIds: [4], assignedPositionIds: [], assignedDepartmentIds: [] };
    expect(GuideAccessHelper.canView(g, viewer(4, null, null), false)).toBe(true);
  });
  it('người có guides.manage xem được mọi guide đã xuất bản dù sai role/vị trí/phòng ban', () => {
    const g = { isPublished: true, assignedRoleIds: [2], assignedPositionIds: [7], assignedDepartmentIds: [5] };
    expect(GuideAccessHelper.canView(g, viewer(4, 9, 6), true)).toBe(true);
  });
});

describe('GuideAccessHelper.canView - requiredPermissions (D2/P0a)', () => {
  const g = { isPublished: true, assignedRoleIds: [] as number[], requiredPermissions: ['customers.assign'] };
  it('có quyền yêu cầu -> xem được; thiếu -> không', () => {
    expect(GuideAccessHelper.canView(g, viewer(4, null, null, ['customers.assign']), false)).toBe(true);
    expect(GuideAccessHelper.canView(g, viewer(4, null, null, ['roles.view']), false)).toBe(false);
    expect(GuideAccessHelper.canView(g, viewer(4), false)).toBe(false);
  });
  it('viewer không có grantedPermissionKeys (undefined) -> coi như không có quyền nào', () => {
    expect(GuideAccessHelper.canView(g, { roleId: 4, positionId: null, departmentId: null }, false)).toBe(false);
  });
  it('requiredPermissions rỗng/undefined -> không yêu cầu', () => {
    expect(GuideAccessHelper.canView({ ...g, requiredPermissions: [] }, viewer(4), false)).toBe(true);
    expect(GuideAccessHelper.canView({ isPublished: true, assignedRoleIds: [] }, viewer(4), false)).toBe(true);
  });
  it('nhiều quyền = AND: phải có TẤT CẢ', () => {
    const many = { ...g, requiredPermissions: ['customers.assign', 'customers.edit'] };
    expect(GuideAccessHelper.canView(many, viewer(4, null, null, ['customers.assign']), false)).toBe(false);
    expect(GuideAccessHelper.canView(many, viewer(4, null, null, ['customers.edit']), false)).toBe(false);
    expect(GuideAccessHelper.canView(many, viewer(4, null, null, ['customers.assign', 'customers.edit', 'roles.view']), false)).toBe(true);
  });
  it('AND với các chiều khác', () => {
    const both = { ...g, assignedRoleIds: [4] };
    expect(GuideAccessHelper.canView(both, viewer(2, null, null, ['customers.assign']), false)).toBe(false);
    expect(GuideAccessHelper.canView(both, viewer(4, null, null, ['customers.assign']), false)).toBe(true);
  });
  it('guides.manage bypass; bản nháp vẫn không ai xem qua đường xem', () => {
    expect(GuideAccessHelper.canView(g, viewer(4), true)).toBe(true);
    expect(GuideAccessHelper.canView({ ...g, isPublished: false }, viewer(4, null, null, ['customers.assign']), true)).toBe(false);
  });
});

describe('GuideAccessHelper.slugify', () => {
  it('bỏ dấu tiếng Việt, đ -> d, gạch ngang', () => {
    expect(GuideAccessHelper.slugify('Cách thêm Khách hàng mới!')).toBe('cach-them-khach-hang-moi');
    expect(GuideAccessHelper.slugify('Đăng nhập & Đổi mật khẩu')).toBe('dang-nhap-doi-mat-khau');
  });
  it('toàn ký tự đặc biệt -> fallback', () => {
    expect(GuideAccessHelper.slugify('!!!')).toBe('huong-dan');
  });
  it('cắt theo độ dài tối đa và không để gạch ngang ở cuối', () => {
    const s = GuideAccessHelper.slugify('abc def ghi', 7);
    expect(s).toBe('abc-def');
    expect(s.length).toBeLessThanOrEqual(7);
  });
});
