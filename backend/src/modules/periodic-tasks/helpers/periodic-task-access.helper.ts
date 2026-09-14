import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';
import { SelectQueryBuilder } from 'typeorm';
import { PeriodicTask } from '../../../database/entities/periodic-task.entity';

/**
 * PeriodicTaskAccessHelper - mirror CHÍNH XÁC `CustomerAccessHelper`
 * (`modules/customers/helpers/customer-access.helper.ts`), xem PLAN mục 0
 * (bằng chứng đối chiếu code thật) - KHÔNG bịa cơ chế phân quyền mới.
 *
 *  scope (role_permissions) | Xem (View)                          | Sửa (trừ xoá) | Xoá
 *  --------------------------|-------------------------------------|----------------|-------
 *  all                       | Tất cả                              | = phạm vi Xem  | Không*
 *  department                | Chỉ Task có department_id thuộc     | = phạm vi Xem  | Không*
 *                            | phòng ban mình quản lý (department_ |                |
 *                            | managers)                            |                |
 *  own                       | Chỉ Task mình tạo HOẶC mình là      | = phạm vi Xem  | Không*
 *                            | primary_assignee_id                  |                |
 *
 * (*) Xoá KHÔNG có khái niệm scope - chỉ `Role.ADMIN` mới xoá được (xem
 * PLAN mục 2.7, mirror đúng `CustomerAccessHelper.canDelete()`).
 *
 * Cũng như CustomerAccessHelper: phạm vi XEM và SỬA là MỘT - `findOne()`
 * (dùng applyViewFilter) PHẢI được gọi TRƯỚC mọi update()/remove() trong
 * PeriodicTasksService, không viết 1 bộ điều kiện "canUpdate" riêng dễ lệch.
 */
export class PeriodicTaskAccessHelper {
  static applyViewFilter(
    query: SelectQueryBuilder<any>,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): SelectQueryBuilder<any> {
    // Admin luôn thấy tất cả - NGOẠI LỆ DUY NHẤT, không dựa vào scope
    // (mirror đúng CustomerAccessHelper.applyViewFilter()).
    if (userRole === Role.ADMIN) return query;

    if (scope === PermissionScope.ALL) {
      return query;
    }

    if (scope === PermissionScope.DEPARTMENT) {
      query.andWhere(
        'task.department_id IN ' +
        '(SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId)',
        { accessManagerId: userId },
      );
      return query;
    }

    // own (và bất kỳ role lạ nào khác ngoài các scope trên, phòng hờ): chỉ
    // Task mình tạo hoặc mình là người phụ trách chính. (Phụ trách PHỤ -
    // `periodic_task_secondary_assignees` - chưa tồn tại tới Phase 4, sẽ bổ
    // sung điều kiện OR ở đây khi tới Phase đó, xem PLAN mục 6 Phase 4.)
    query.andWhere(
      '(task.createdById = :accessUserId OR task.primaryAssigneeId = :accessUserId)',
      { accessUserId: userId },
    );

    return query;
  }

  /** Quyền XOÁ 1 Task - CHỈ Admin, không có ngoại lệ (mirror `CustomerAccessHelper.canDelete()`). */
  static canDelete(_task: PeriodicTask, _userId: number, userRole: string): boolean {
    return userRole === Role.ADMIN;
  }

  /**
   * Kiểm tra quyền quản lý (sửa) 1 Task CỤ THỂ đã có sẵn trong tay (object,
   * không qua query đã lọc applyViewFilter) - dùng cho những chỗ cần kiểm
   * tra trong bộ nhớ thay vì sinh điều kiện SQL (mirror
   * `CustomerAccessHelper.canManageCustomer()`).
   */
  static canManageTask(
    task: PeriodicTask,
    userId: number,
    userRole: string,
    managerDepartmentIds: number[] = [],
    scope?: string | null,
  ): boolean {
    if (userRole === Role.ADMIN) return true;

    if (scope === PermissionScope.ALL) return true;

    if (scope === PermissionScope.DEPARTMENT) {
      return (
        task.departmentId != null &&
        managerDepartmentIds.includes(task.departmentId)
      );
    }

    return task.createdById === userId || task.primaryAssigneeId === userId;
  }
}
