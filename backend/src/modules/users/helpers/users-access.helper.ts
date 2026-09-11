import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';
import { SelectQueryBuilder } from 'typeorm';
import { Repository } from 'typeorm';
import { Department } from '../../../database/entities/department.entity';
import { DepartmentManager } from '../../../database/entities/department-manager.entity';
import { DepartmentManagerHelper } from '../../departments/helpers/department-manager.helper';

/**
 * Phân quyền module Users - hoàn toàn dựa vào `scope` (own/department/all)
 * mà `PermissionGuard` tra được từ bảng `role_permissions`, KHÔNG còn
 * hardcode theo `Role` enum. NGOẠI LỆ DUY NHẤT: `Role.ADMIN` luôn thấy/
 * quản lý tất cả bất kể `role_permissions` đang cấu hình gì (đồng bộ với
 * lối thoát hiểm ở `PermissionGuard`/`RolesService.getMyPermissions()`).
 *
 * Với 4 role hệ thống, `role_permissions` được seed mặc định đúng ý đồ gốc
 * (Assistant=all, Manager=department, Employee=own cho `users.view`/
 * `users.manage`) - nhưng đó chỉ là DỮ LIỆU MẶC ĐỊNH, Admin có thể đổi qua
 * trang "Phân quyền" bất cứ lúc nào, kể cả cho role hệ thống (xem
 * PERMISSIONS.md mục 1.7). Hàm ở đây không "biết" role nào nghĩa là gì -
 * chỉ đọc đúng giá trị `scope` được truyền vào từ Controller.
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
    scope?: string | null,
  ): SelectQueryBuilder<any> {
    // Admin luôn thấy tất cả — NGOẠI LỆ DUY NHẤT, không dựa vào scope.
    if (viewerRole === Role.ADMIN) return query;

    // scope='all' (từ role_permissions - đúng cho Assistant/role tuỳ chỉnh
    // được cấp scope='all') → thấy tất cả. KHÔNG còn fallback cứng theo
    // Role.ASSISTANT - hành vi hoàn toàn do bảng role_permissions quyết định.
    if (scope === PermissionScope.ALL) {
      return query;
    }

    // scope='department' (từ role_permissions) → lọc theo phòng ban mình
    // quản lý + luôn thấy chính mình. KHÔNG còn fallback cứng theo
    // Role.MANAGER. Đọc từ bảng nhiều-nhiều `department_managers` (1 phòng
    // ban có thể có NHIỀU Manager/Assistant cùng quản lý) - thay cho cột
    // đơn `departments.manager_user_id` cũ (đã deprecated).
    if (scope === PermissionScope.DEPARTMENT) {
      query.andWhere(
        '(user.department_id IN ' +
        '(SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId)' +
        ' OR user.id = :accessManagerId)',
        { accessManagerId: viewerId },
      );
      return query;
    }

    // own (và role lạ khác, phòng hờ): chỉ thấy chính mình.
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
    scope?: string | null,
  ): Promise<boolean> {
    if (viewerRole === Role.ADMIN) return true;

    // scope='all' (role_permissions) → quản lý tất cả. Không còn fallback
    // cứng theo Role.ASSISTANT.
    if (scope === PermissionScope.ALL) return true;

    // scope='department' (role_permissions) → kiểm tra phòng ban. Không
    // còn fallback cứng theo Role.MANAGER. Đọc từ bảng nhiều-nhiều
    // `department_managers` qua DepartmentManagerHelper (dùng chung).
    if (scope === PermissionScope.DEPARTMENT) {
      if (targetId === viewerId) return true; // Manager luôn tự sửa được chính mình
      if (targetDepartmentId == null) return false;
      const departmentManagerRepo = departmentRepo.manager.getRepository(DepartmentManager);
      return DepartmentManagerHelper.isManagerOfDepartment(
        departmentManagerRepo,
        targetDepartmentId,
        viewerId,
      );
    }

    // own: chỉ chính mình.
    return targetId === viewerId;
  }

  /**
   * Danh sách id phòng ban mà `managerId` đang được gán quản lý (nhiều-nhiều,
   * bảng `department_managers`) - dùng cho các chỗ cần validate "phòng ban
   * được chọn có phải phòng ban mình quản lý không" (vd tạo user mới, duyệt
   * đăng ký) mà không tiện viết subquery SQL trực tiếp (DTO chỉ có
   * departmentId đơn lẻ, không phải query builder).
   */
  static async getManagedDepartmentIds(
    departmentRepo: Repository<Department>,
    managerId: number,
  ): Promise<number[]> {
    const departmentManagerRepo = departmentRepo.manager.getRepository(DepartmentManager);
    return DepartmentManagerHelper.getManagedDepartmentIds(departmentManagerRepo, managerId);
  }
}