import { GuideAccessHelper } from './guide-access.helper';

describe('GuideAccessHelper.canView', () => {
  it('bản nháp: không ai xem được qua đường xem (kể cả người có guides.manage)', () => {
    expect(GuideAccessHelper.canView({ isPublished: false, assignedRoleIds: [] }, 1, false)).toBe(false);
    expect(GuideAccessHelper.canView({ isPublished: false, assignedRoleIds: [] }, 1, true)).toBe(false);
  });
  it('đã xuất bản + không gán role nào: mọi role xem được', () => {
    expect(GuideAccessHelper.canView({ isPublished: true, assignedRoleIds: [] }, 4, false)).toBe(true);
    expect(GuideAccessHelper.canView({ isPublished: true, assignedRoleIds: [] }, null, false)).toBe(true);
  });
  it('đã xuất bản + có gán role: chỉ role trong danh sách', () => {
    const g = { isPublished: true, assignedRoleIds: [2, 3] };
    expect(GuideAccessHelper.canView(g, 2, false)).toBe(true);
    expect(GuideAccessHelper.canView(g, 4, false)).toBe(false);
    expect(GuideAccessHelper.canView(g, null, false)).toBe(false);
  });
  it('người có guides.manage xem được mọi guide đã xuất bản dù sai role', () => {
    expect(GuideAccessHelper.canView({ isPublished: true, assignedRoleIds: [2] }, 4, true)).toBe(true);
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
