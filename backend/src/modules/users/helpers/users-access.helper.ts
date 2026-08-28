import { Role } from '../../../common/enums/role.enum';
import { SelectQueryBuilder } from 'typeorm';
import { Repository } from 'typeorm';
import { Department } from '../../../database/entities/department.entity';

/**
 * Bảng phân quyền module Users - PERMISSIONS.md mục 2.2 (dựng cùng pattern
 * `CustomerAccessHelper` theo mục 1, quy tắc kỹ thuật #2 và #4: "1 nguồn áp
 * filter duy nhất", "module mới có khái niệm phòng ban thì viết 1 helper
 * riêng, không rải điều kiện role khắp nơi"):
 *
 *  Role       | Xem (View)                          | Sửa (trừ xoá - không có xoá user)
 *  -----------|--------------------------------------|--------------------------------
 *  ADMIN      | Tất cả                               | Tất cả
 *  ASSISTANT  | Tất cả (bất chấp phòng ban)           | Tất cả
 *  MANAGER    | Chỉ user thuộc phòng ban mình quản lý | = phạm vi Xem
 *             | (department.manager_user_id = mình)  |
 *             | + LUÔN xem được CHÍNH MÌNH            |
 *  EMPLOYEE   | CHỈ chính mình (self)                 | = phạm vi Xem (self)
 *
 * Không có khái niệm "Xoá" ở module này (không có endpoint xoá user - chỉ
 * có isActive=false qua update()).
 */
export class UsersAccessHelper {
  /**
   * Áp filter phân quyền XEM vào 1 QueryBuilder có alias gốc là 'user' -
   * dùng cho findAll(). `viewerId` là id người đang gọi API (để Manager luôn
   * thấy được chính mình dù bản thân không thuộc phòng ban mình quản lý -
   * quản lý bị xếp vào phòng ban A nhưng đang QUẢN LÝ phòng ban B thì vẫn
   * cần thấy hồ sơ của chính mình).
   */
  static applyViewFilter(
    query: SelectQueryBuilder<any>,
    viewerId: number,
    viewerRole: string,
  ): SelectQueryBuilder<any> {
    if (viewerRole === Role.ADMIN || viewerRole === Role.ASSISTANT) {
      return query;
    }

    if (viewerRole === Role.MANAGER) {
      query.andWhere(
        '(user.department_id IN ' +
        '(SELECT d.id FROM departments d WHERE d.manager_user_id = :accessManagerId)' +
        ' OR user.id = :accessManagerId)',
        { accessManagerId: viewerId },
      );
      return query;
    }

    // EMPLOYEE (và role lạ khác, phòng hờ): chỉ thấy chính mình.
    query.andWhere('user.id = :accessUserId', { accessUserId: viewerId });
    return query;
  }

  /**
   * Kiểm tra 1 user CỤ THỂ (đã biết targetId + targetDepartmentId, KHÔNG
   * qua query đã lọc applyViewFilter) có nằm trong phạm vi quản lý của
   * người gọi hay không - dùng cho update()/resetPassword()/updateProfile()
   * (đã fetch sẵn record, chỉ cần biết có được phép hay không thay vì lọc
   * cả tập). Đồng bộ đúng 1 bộ quy tắc với applyViewFilter().
   */
  static async canManageUser(
    departmentRepo: Repository<Department>,
    targetId: number,
    targetDepartmentId: number | null | undefined,
    viewerId: number,
    viewerRole: string,
  ): Promise<boolean> {
    if (viewerRole === Role.ADMIN || viewerRole === Role.ASSISTANT) return true;

    if (viewerRole === Role.MANAGER) {
      if (targetId === viewerId) return true; // Manager luôn tự sửa được chính mình
      if (targetDepartmentId == null) return false;
      const dept = await departmentRepo.findOne({
        where: { id: targetDepartmentId, managerUserId: viewerId },
      });
      return !!dept;
    }

    // EMPLOYEE: chỉ chính mình.
    return targetId === viewerId;
  }

  /**
   * Danh sách id phòng ban mà `managerId` đang là `manager_user_id` - dùng
   * cho các chỗ cần validate "phòng ban được chọn có phải phòng ban mình
   * quản lý không" (vd tạo user mới, duyệt đăng ký) mà không tiện viết
   * subquery SQL trực tiếp (DTO chỉ có departmentId đơn lẻ, không phải
   * query builder).
   */
  static async getManagedDepartmentIds(
    departmentRepo: Repository<Department>,
    managerId: number,
  ): Promise<number[]> {
    const depts = await departmentRepo.find({
      where: { managerUserId: managerId },
      select: ['id'],
    });
    return depts.map((d) => d.id);
  }
}
