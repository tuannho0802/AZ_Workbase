import { Role } from '../../../common/enums/role.enum';
import { SelectQueryBuilder, Brackets } from 'typeorm';
import { Customer } from '../../../database/entities/customer.entity';

/**
 * Bảng phân quyền khách hàng (áp dụng thống nhất cho MỌI endpoint list/get,
 * và gián tiếp cho sửa - xem ghi chú ở applyViewFilter):
 *
 *  Role       | Xem (View)                        | Sửa (trừ xoá)  | Xoá
 *  -----------|------------------------------------|----------------|-------
 *  ADMIN      | Tất cả                             | Tất cả         | Được
 *  ASSISTANT  | Tất cả (bất chấp phòng ban)         | Tất cả         | Không
 *  MANAGER    | Chỉ KH thuộc phòng ban mình quản lý | = phạm vi Xem  | Không
 *             | (department.manager_user_id = mình) |                |
 *  EMPLOYEE   | Chỉ KH mình tạo/làm sales chính/     | = phạm vi Xem  | Không
 *             | đang được gán (assignment active)   |                |
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
  ): SelectQueryBuilder<any> {
    if (userRole === Role.ADMIN || userRole === Role.ASSISTANT) {
      return query;
    }

    if (userRole === Role.MANAGER) {
      query.andWhere(
        'customer.department_id IN ' +
        '(SELECT d.id FROM departments d WHERE d.manager_user_id = :accessManagerId)',
        { accessManagerId: userId },
      );
      return query;
    }

    // EMPLOYEE (và bất kỳ role lạ nào khác ngoài 3 role trên, phòng hờ):
    // chỉ được xem KH do mình tạo, mình làm sales chính, hoặc mình đang có
    // 1 lượt gán còn hiệu lực (bulk-assign có thể gán 1 KH cho nhiều
    // người, không chỉ riêng salesUserId "chính").
    query.andWhere(
      new Brackets((qb) => {
        qb.where('customer.createdById = :accessUserId', { accessUserId: userId })
          .orWhere('customer.salesUserId = :accessUserId', { accessUserId: userId })
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
   * managerDepartmentIds: chỉ cần truyền khi userRole === MANAGER - danh
   * sách id phòng ban mà user này là manager_user_id (lấy 1 lần trước khi
   * lặp qua nhiều customer, KHÔNG query lại cho từng customer).
   */
  static canManageCustomer(
    customer: Customer,
    userId: number,
    userRole: string,
    managerDepartmentIds: number[] = [],
  ): boolean {
    if (userRole === Role.ADMIN || userRole === Role.ASSISTANT) return true;

    if (userRole === Role.MANAGER) {
      return (
        customer.departmentId != null &&
        managerDepartmentIds.includes(customer.departmentId)
      );
    }

    return (
      customer.createdById === userId || customer.salesUserId === userId
    );
  }
}