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
 *  own                       | Chỉ Task mình tạo, HOẶC mình là     | = phạm vi Xem  | Không*
 *                            | Phụ trách CHÍNH (primary_assignee_  |                |
 *                            | id), HOẶC mình là Phụ trách PHỤ     |                |
 *                            | (periodic_task_secondary_assignees) |                |
 *
 * (*) Xoá KHÔNG có khái niệm scope - chỉ `Role.ADMIN` mới xoá được (xem
 * PLAN mục 2.7, mirror đúng `CustomerAccessHelper.canDelete()`).
 *
 * ⚠️ SỬA (2026-09-15, sau khi phát hiện bug thật): nhánh `own` TRƯỚC ĐÂY chỉ
 * tính `createdById`/`primaryAssigneeId` - JSDoc gốc (viết ở Phase 1, trước
 * khi bảng `periodic_task_secondary_assignees` tồn tại) có ghi chú "sẽ bổ
 * sung điều kiện OR khi tới Phase 4" nhưng bị BỎ SÓT thật khi Phase 4 code
 * xong (không có entry nào trong `WORKFLOW_LOG.md` quay lại sửa file này).
 * Hệ quả: 1 Employee (scope `own`) chỉ được gán làm Phụ trách PHỤ của 1 Task
 * (không phải người tạo, không phải Phụ trách chính) trước đây KHÔNG thấy/
 * sửa được Task đó (kể cả checklist con Phase 6, vì mọi sub-resource đều
 * gate qua `PeriodicTasksService.findOne()` dùng CHUNG helper này) - nay đã
 * vá ở CẢ `applyViewFilter()` lẫn `canManageTask()` để 2 hàm luôn khớp nhau
 * (đúng nguyên tắc "phạm vi Xem và Sửa là MỘT" ở dưới).
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

    // own (và bất kỳ role lạ nào khác ngoài các scope trên, phòng hờ): Task
    // mình tạo, HOẶC mình là Phụ trách CHÍNH, HOẶC mình là Phụ trách PHỤ
    // (subquery `periodic_task_secondary_assignees` - đã vá, xem JSDoc lớp).
    query.andWhere(
      '(task.createdById = :accessUserId OR task.primaryAssigneeId = :accessUserId OR ' +
      'task.id IN (SELECT psa.task_id FROM periodic_task_secondary_assignees psa WHERE psa.user_id = :accessUserId))',
      { accessUserId: userId },
    );

    return query;
  }

  /**
   * Quyền XOÁ 1 Task, THEO SCOPE của `periodic_tasks.delete` (đổi 2026-09-24 -
   * trước đây cứng "chỉ Admin"): Admin luôn được; scope `all`/`department` được
   * (Task đã qua `findOne()` lọc theo đúng scope trước khi tới đây); scope
   * `own` (hoặc null - phòng hờ) CHỈ được xoá Task do MÌNH TẠO hoặc mình là
   * Phụ trách CHÍNH - Phụ trách PHỤ được xem/sửa nhưng KHÔNG được xoá.
   */
  static canDelete(task: PeriodicTask, userId: number, userRole: string, scope?: string | null): boolean {
    if (userRole === Role.ADMIN) return true;
    if (scope === PermissionScope.ALL || scope === PermissionScope.DEPARTMENT) return true;
    return task.createdById === userId || task.primaryAssigneeId === userId;
  }

  /**
   * Kiểm tra quyền quản lý (sửa) 1 Task CỤ THỂ đã có sẵn trong tay (object,
   * không qua query đã lọc applyViewFilter) - dùng cho những chỗ cần kiểm
   * tra trong bộ nhớ thay vì sinh điều kiện SQL (mirror
   * `CustomerAccessHelper.canManageCustomer()`).
   *
   * `secondaryAssigneeUserIds` (mirror cách truyền `managerDepartmentIds`
   * của nhánh `department`): danh sách `user_id` đang là Phụ trách PHỤ của
   * chính Task này - caller tự truy vấn `periodic_task_secondary_assignees`
   * rồi truyền vào (hàm này KHÔNG tự query DB, giữ đúng nguyên tắc đồng bộ/
   * thuần dữ liệu trong bộ nhớ như từ trước tới giờ). Mặc định rỗng (phòng
   * thủ) - GIỐNG hệt `managerDepartmentIds`.
   */
  static canManageTask(
    task: PeriodicTask,
    userId: number,
    userRole: string,
    managerDepartmentIds: number[] = [],
    scope?: string | null,
    secondaryAssigneeUserIds: number[] = [],
  ): boolean {
    if (userRole === Role.ADMIN) return true;

    if (scope === PermissionScope.ALL) return true;

    if (scope === PermissionScope.DEPARTMENT) {
      return (
        task.departmentId != null &&
        managerDepartmentIds.includes(task.departmentId)
      );
    }

    return (
      task.createdById === userId ||
      task.primaryAssigneeId === userId ||
      secondaryAssigneeUserIds.includes(userId)
    );
  }
}