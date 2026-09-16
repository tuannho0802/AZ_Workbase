import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';
import { SelectQueryBuilder, Brackets } from 'typeorm';
import { Customer } from '../../../database/entities/customer.entity';

/**
 * Phân quyền khách hàng (áp dụng thống nhất cho MỌI endpoint list/get, và
 * gián tiếp cho sửa - xem ghi chú ở applyViewFilter):
 *
 *  scope (role_permissions) | Xem (View)                      | Sửa/Xoá mềm
 *  --------------------------|----------------------------------|----------------
 *  all                       | Tất cả                           | = phạm vi Xem
 *  department                | KH thuộc phòng ban mình quản lý   | = phạm vi Xem
 *                            | (department_managers) HOẶC KH mà  |
 *                            | mình là chủ (như cột 'own' bên    |
 *                            | dưới) - department là SUPERSET     |
 *                            | của own, không phải tập tách biệt  |
 *  own                       | Chỉ KH mình tạo/làm sales chính/   | = phạm vi Xem
 *                            | đang được gán (assignment active)  |
 *
 * (*) Xoá MỀM (đưa vào thùng rác): TRƯỚC ĐÂY chỉ `Role.ADMIN` cứng (xem
 * `canDelete()` - ĐÃ XOÁ khỏi class này, xem migration
 * `SplitCustomersHardDeletePermission` + JSDoc `CustomersService.remove()`).
 * GIỜ hoàn toàn theo permission `customers.delete` (role_permissions) như
 * mọi hành động khác - PermissionGuard xác nhận CÓ quyền, applyViewFilter()
 * (qua findOne() trong service) xác nhận khách hàng nằm trong phạm vi XEM -
 * đủ điều kiện để xoá mềm, KHÔNG cần thêm rào cản admin-only riêng.
 * Xoá VĨNH VIỄN (hard delete, không thể khôi phục) vẫn là 1 permission
 * TÁCH RIÊNG (`customers.hard_delete`) - mặc định chỉ Admin được cấp, Admin
 * có thể mở rộng qua trang "Phân quyền" nếu muốn.
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
 * Nguyên tắc thiết kế quan trọng: với app này, phạm vi XEM, SỬA, và (từ đợt
 * sửa này) XOÁ MỀM là MỘT - ai xem được 1 khách hàng thì cũng sửa/xoá mềm
 * được khách hàng đó (miễn là có permission tương ứng - `customers.edit`/
 * `customers.delete`). Vì vậy applyViewFilter() là nguồn chân lý DUY NHẤT
 * cho cả 3 việc: các hàm update()/remove() trong service đều gọi findOne()
 * (dùng applyViewFilter) TRƯỚC khi sửa/xoá - nếu findOne() không trả về
 * được customer (không nằm trong phạm vi xem) thì sẽ tự động 404 trước khi
 * kịp chạm tới bước sửa/xoá, nên không cần thêm 1
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
    //
    // ⚠️ FIX BUG THẬT (báo lỗi trực tiếp từ người dùng, kèm ảnh chụp màn
    // hình): Assistant được cấp `customers.view` scope='department' tự tạo
    // 1 khách hàng ("Test xoá assistant") rồi filter "Người nhập Data =
    // chính mình" ở trang Khách hàng -> danh sách TRỐNG, dù chính họ vừa
    // tạo ra bản ghi đó. Nguyên nhân: nhánh này TRƯỚC ĐÂY chỉ lọc thuần
    // theo `department_id IN (phòng ban mình quản lý)` - nếu khách hàng đó
    // không có department_id (chưa gán phòng ban) hoặc thuộc phòng ban
    // KHÁC phòng ban mình quản lý, thì dù chính mình là người tạo/sales
    // chính/marketing phụ trách vẫn bị lọc mất, hoàn toàn không có đường
    // "own" nào để lọt qua. Yêu cầu đúng của người dùng: "Xem phòng ban của
    // mình là vừa thấy data của phòng ban mình mà vừa thấy Data của mình
    // nữa" - tức scope='department' phải là SUPERSET của scope='own', không
    // phải 1 tập độc lập tách biệt. Đã có đúng tiền lệ này ở chỗ khác trong
    // cùng service (`getUnassigned()`: nhánh DEPARTMENT có
    // `.orWhere('customer.salesUserId = :userId', ...)` cạnh điều kiện
    // department) - áp dụng lại ở đây cho nhất quán trên toàn bộ app.
    //
    // SỬA: OR thêm đúng 4 điều kiện "own" (createdById/salesUserId/
    // marketingUserId/customer_assignments đang active) - giống hệt bộ điều
    // kiện ở nhánh 'own' bên dưới - cạnh điều kiện phòng ban, thay vì thay
    // thế nó.
    if (scope === PermissionScope.DEPARTMENT) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where(
            'customer.department_id IN ' +
            '(SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId)',
            { accessManagerId: userId },
          )
            .orWhere('customer.createdById = :accessUserId', { accessUserId: userId })
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

    // ⚠️ Đồng bộ với fix ở applyViewFilter() phía trên: scope='department'
    // phải là SUPERSET của 'own' (thấy/sửa được phòng ban mình quản lý VÀ
    // data của chính mình, không chỉ riêng phòng ban) - nếu không 2 hàm này
    // lệch quy tắc nhau dù cùng 1 bảng "Xem = Sửa" ở JSDoc đầu file.
    if (scope === PermissionScope.DEPARTMENT) {
      const inManagedDepartment =
        customer.departmentId != null &&
        managerDepartmentIds.includes(customer.departmentId);
      return (
        inManagedDepartment ||
        customer.createdById === userId ||
        customer.salesUserId === userId ||
        customer.marketingUserId === userId
      );
    }

    return (
      customer.createdById === userId ||
      customer.salesUserId === userId ||
      customer.marketingUserId === userId
    );
  }
}