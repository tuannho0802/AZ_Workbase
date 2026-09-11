import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';
import { SelectQueryBuilder, Brackets } from 'typeorm';
import { Customer } from '../../../database/entities/customer.entity';

/**
 * Phân quyền khách hàng (áp dụng thống nhất cho MỌI endpoint list/get, và
 * gián tiếp cho sửa - xem ghi chú ở applyViewFilter):
 *
 *  scope (role_permissions) | Xem (View)                      | Sửa (trừ xoá) | Xoá
 *  --------------------------|----------------------------------|----------------|-------
 *  all                       | Tất cả                           | = phạm vi Xem  | Không*
 *  department                | Chỉ KH thuộc phòng ban mình quản  | = phạm vi Xem  | Không*
 *                            | lý (tồn tại dòng trong bảng       |                |
 *                            | department_managers cho user này) |                |
 *  own                       | Chỉ KH mình tạo/làm sales chính/   | = phạm vi Xem  | Không*
 *                            | đang được gán (assignment active)  |                |
 *
 * (*) Xoá KHÔNG có khái niệm scope - chỉ `Role.ADMIN` mới xoá được, xem
 * `canDelete()`, không phụ thuộc `role_permissions`.
 *
 * Hoàn toàn thuần theo `scope` mà `PermissionGuard` tra từ `role_permissions`
 * - KHÔNG còn hardcode theo `Role` enum (Assistant, Manager, Employee).
 * NGOẠI LỆ DUY NHẤT: `Role.ADMIN` luôn thấy/sửa/xoá tất cả bất kể
 * `role_permissions` cấu hình gì (đồng bộ với lối thoát hiểm ở
 * `PermissionGuard`). Với 4 role hệ thống, `role_permissions` được seed mặc
 * định scope tương ứng đúng bảng trên - đây chỉ là DỮ LIỆU MẶC ĐỊNH, Admin
 * có thể đổi qua trang "Phân quyền" bất cứ lúc nào (xem PERMISSIONS.md mục
 * 1.7).
 *
 * Nguyên tắc thiết kế quan trọng: với app này, phạm vi XEM và phạm vi SỬA
 * là MỘT - ai xem được 1 khách hàng thì cũng sửa được khách hàng đó (chỉ
 * XOÁ là ngoại lệ, luôn riêng Admin). Vì vậy applyViewFilter() là nguồn
 * chân lý DUY NHẤT cho cả 2 việc: các hàm update()/remove() trong service
 * đều gọi findOne() (dùng applyViewFilter) TRƯỚC khi sửa/xoá - nếu
 * findOne() không trả về được customer (không nằm trong phạm vi xem) thì
 * sẽ tự động 404 trước khi kịp chạm tới bước sửa/xoá, nên không cần thêm 1
 * bộ điều kiện "canUpdate" riêng dễ bị lệch khỏi applyViewFilter.
 */
export class CustomerAccessHelper {
  /**
   * Áp filter phân quyền XEM vào 1 QueryBuilder có alias gốc là 'customer'
   * (dùng cho mọi query list/count/stats khách hàng - findAll, findOne,
   * getAssigned, getStats*, getAllDepositsStats...).
   */
  static applyViewFilter(
    query: SelectQueryBuilder<any>,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): SelectQueryBuilder<any> {
    // Admin luôn thấy tất cả — NGOẠI LỆ DUY NHẤT, không dựa vào scope.
    if (userRole === Role.ADMIN) return query;

    // scope='all' (từ role_permissions) → thấy tất cả. KHÔNG còn fallback
    // cứng theo Role.ASSISTANT - hành vi hoàn toàn do role_permissions quyết định.
    if (scope === PermissionScope.ALL) {
      return query;
    }

    // scope='department' (từ role_permissions) → lọc theo phòng ban mình
    // quản lý. KHÔNG còn fallback cứng theo Role.MANAGER. Đọc bảng
    // nhiều-nhiều `department_managers` (1 phòng ban có thể có NHIỀU
    // Manager/Assistant cùng quản lý) - thay cho cột đơn
    // `departments.manager_user_id` cũ (đã deprecated).
    if (scope === PermissionScope.DEPARTMENT) {
      query.andWhere(
        'customer.department_id IN ' +
        '(SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId)',
        { accessManagerId: userId },
      );
      return query;
    }

    // own (và bất kỳ role lạ nào khác ngoài các scope trên, phòng hờ):
    // chỉ được xem KH do mình tạo, mình làm sales chính, mình là Marketing
    // phụ trách, hoặc mình đang có 1 lượt gán còn hiệu lực (bulk-assign có
    // thể gán 1 KH cho nhiều người, không chỉ riêng salesUserId "chính").
    // ⚠️ FIX BUG THẬT: trước đây thiếu `marketingUserId = mình` ở đây ->
    // User được gán làm Marketing phụ trách (customer.marketing_user_id)
    // nhưng không phải người tạo/không phải Sales chính/không có dòng
    // customer_assignments (bảng đó chỉ ghi nhận gán Sales) thì KHÔNG thấy
    // được khách hàng của chính mình trong mọi màn hình dùng applyViewFilter
    // (danh sách chính, Chia Data, Gán/Assign...).
    query.andWhere(
      new Brackets((qb) => {
        qb.where('customer.createdById = :accessUserId', { accessUserId: userId })
          .orWhere('customer.salesUserId = :accessUserId', { accessUserId: userId })
          .orWhere('customer.marketingUserId = :accessUserId', { accessUserId: userId })
          .orWhere(
            'customer.id IN ' +
            '(SELECT ca.customer_id FROM customer_assignments ca ' +
            ' WHERE ca.assigned_to_id = :accessUserId AND ca.status = :accessStatus)',
            { accessUserId: userId, accessStatus: 'active' },
          );
      }),
    );

    return query;
  }

  /**
   * Quyền XOÁ 1 khách hàng - CHỈ Admin, không có ngoại lệ (kể cả người tạo
   * ra bản ghi). Trước đây hàm này còn cho phép "chủ sở hữu" (createdById)
   * tự xoá bản ghi của mình - không còn đúng theo yêu cầu mới (Assistant/
   * Manager/Employee đều KHÔNG được xoá, chỉ Admin).
   */
  static canDelete(
    _customer: Customer,
    _userId: number,
    userRole: string,
  ): boolean {
    return userRole === Role.ADMIN;
  }

  /**
   * Kiểm tra quyền quản lý (sửa/gán) 1 khách hàng CỤ THỂ đã có sẵn trong
   * tay (dạng object, không qua query đã lọc applyViewFilter trước đó) -
   * dùng cho những chỗ fetch dữ liệu theo lô để tối ưu hiệu năng thay vì
   * gọi findOne() cho từng bản ghi (vd bulkAssign() lấy nguyên danh sách
   * customer theo ID rồi tự kiểm tra quyền trong vòng lặp, xem
   * customers.service.ts). Cùng 1 bộ quy tắc với applyViewFilter(), chỉ
   * khác là kiểm tra trong bộ nhớ thay vì sinh điều kiện SQL.
   *
   * managerDepartmentIds: chỉ cần truyền khi scope === department - danh
   * sách id phòng ban mà user này được gán quản lý (bảng nhiều-nhiều
   * department_managers, lấy 1 lần trước khi lặp qua nhiều customer, KHÔNG
   * query lại cho từng customer).
   */
  static canManageCustomer(
    customer: Customer,
    userId: number,
    userRole: string,
    managerDepartmentIds: number[] = [],
    scope?: string | null,
  ): boolean {
    if (userRole === Role.ADMIN) return true;

    if (scope === PermissionScope.ALL) return true;

    if (scope === PermissionScope.DEPARTMENT) {
      return (
        customer.departmentId != null &&
        managerDepartmentIds.includes(customer.departmentId)
      );
    }

    return (
      customer.createdById === userId ||
      customer.salesUserId === userId ||
      customer.marketingUserId === userId
    );
  }
}