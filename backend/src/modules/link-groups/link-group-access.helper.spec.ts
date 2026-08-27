import { LinkGroupAccessHelper } from './helpers/link-group-access.helper';
import { Role } from '../../common/enums/role.enum';

describe('LinkGroupAccessHelper', () => {
  describe('canManage', () => {
    it('admin luôn được xem/thao tác bất kể có phải chính/phụ hay không', () => {
      expect(LinkGroupAccessHelper.canManage(999, Role.ADMIN, null, [])).toBe(true);
      expect(LinkGroupAccessHelper.canManage(999, Role.ADMIN, 1, [2, 3])).toBe(true);
    });

    it('user là Quản lý chính -> được xem/thao tác', () => {
      expect(LinkGroupAccessHelper.canManage(5, Role.EMPLOYEE, 5, [])).toBe(true);
    });

    it('user nằm trong danh sách Quản lý phụ -> được xem/thao tác', () => {
      expect(LinkGroupAccessHelper.canManage(7, Role.EMPLOYEE, 5, [7, 9])).toBe(true);
    });

    it('user KHÔNG liên quan gì (không chính, không phụ, không admin) -> KHÔNG được xem', () => {
      expect(LinkGroupAccessHelper.canManage(11, Role.EMPLOYEE, 5, [7, 9])).toBe(false);
    });

    it('group chưa có Quản lý chính (null) và danh sách phụ rỗng -> user thường không thấy gì', () => {
      expect(LinkGroupAccessHelper.canManage(1, Role.EMPLOYEE, null, [])).toBe(false);
    });
  });

  describe('canEditSecondaryManagers', () => {
    it('admin luôn được thêm/xoá Quản lý phụ', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(999, Role.ADMIN, 1)).toBe(true);
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(999, Role.ADMIN, null)).toBe(true);
    });

    it('Quản lý CHÍNH được thêm/xoá Quản lý phụ của nhóm mình', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(5, Role.EMPLOYEE, 5)).toBe(true);
    });

    it('Quản lý PHỤ KHÔNG có quyền thêm/xoá Quản lý phụ khác (chỉ chính mới được)', () => {
      // userId=7 là quản lý phụ (giả định ở tầng service), nhưng primaryManagerId=5 -> không khớp -> false
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(7, Role.EMPLOYEE, 5)).toBe(false);
    });

    it('user không liên quan -> false', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(11, Role.EMPLOYEE, 5)).toBe(false);
    });

    it('group chưa có Quản lý chính (null) -> user thường không có quyền (chỉ admin mới sửa được lúc này)', () => {
      expect(LinkGroupAccessHelper.canEditSecondaryManagers(1, Role.EMPLOYEE, null)).toBe(false);
    });
  });
});
