import { LinkGroupAccessHelper } from './helpers/link-group-access.helper';

describe('LinkGroupAccessHelper', () => {
  describe('canManage', () => {
    it('hasBroadAccess=true (Admin/Assistant/role tuỳ chỉnh có link_groups.manage) luôn được xem/thao tác bất kể có phải chính/phụ hay không', () => {
      expect(LinkGroupAccessHelper.canManage(999, true, null, [])).toBe(true);
      expect(LinkGroupAccessHelper.canManage(999, true, 1, [2, 3])).toBe(true);
    });

    it('user là Quản lý chính -> được xem/thao tác dù không có quyền rộng', () => {
      expect(LinkGroupAccessHelper.canManage(5, false, 5, [])).toBe(true);
    });

    it('user nằm trong danh sách Quản lý phụ -> được xem/thao tác dù không có quyền rộng', () => {
      expect(LinkGroupAccessHelper.canManage(7, false, 5, [7, 9])).toBe(true);
    });

    it('user KHÔNG liên quan gì (không chính, không phụ, không có quyền rộng) -> KHÔNG được xem', () => {
      expect(LinkGroupAccessHelper.canManage(11, false, 5, [7, 9])).toBe(false);
    });

    it('group chưa có Quản lý chính (null) và danh sách phụ rỗng -> user thường không thấy gì', () => {
      expect(LinkGroupAccessHelper.canManage(1, false, null, [])).toBe(false);
    });
  });

  describe('canEditSecondaryManagers', () => {
    it('hasBroadAccess=true luôn được thêm/xoá Quản lý phụ', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(999, true, 1)).toBe(true);
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(999, true, null)).toBe(true);
    });

    it('Quản lý CHÍNH được thêm/xoá Quản lý phụ của nhóm mình dù không có quyền rộng', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(5, false, 5)).toBe(true);
    });

    it('Quản lý PHỤ KHÔNG có quyền thêm/xoá Quản lý phụ khác (chỉ chính mới được)', () => {
      // userId=7 là quản lý phụ (giả định ở tầng service), nhưng primaryManagerId=5 -> không khớp -> false
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(7, false, 5)).toBe(false);
    });

    it('user không liên quan -> false', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(11, false, 5)).toBe(false);
    });

    it('group chưa có Quản lý chính (null) -> user thường không có quyền (chỉ người có quyền rộng mới sửa được lúc này)', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(1, false, null)).toBe(false);
    });
  });
});