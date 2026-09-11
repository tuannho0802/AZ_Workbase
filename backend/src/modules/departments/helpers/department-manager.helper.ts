import { Repository } from 'typeorm';
import { DepartmentManager } from '../../../database/entities/department-manager.entity';

/**
 * Helper DÙNG CHUNG cho MỌI module cần biết "user X có đang là 1 trong các
 * Manager/Assistant được gán quản lý phòng ban nào không" - nguồn chân lý
 * DUY NHẤT thay thế cho 4 bản sao logic cũ từng nằm rải rác (mỗi service tự
 * query `departments.manager_user_id = X`): UsersAccessHelper,
 * CustomerAccessHelper (qua SQL subquery riêng), LeaveRequestsService,
 * ZkDeviceService.
 *
 * Nhận vào 1 `Repository<DepartmentManager>` lấy qua
 * `anyRepo.manager.getRepository(DepartmentManager)` tại call site (đúng
 * pattern đã dùng sẵn trong `customers.service.ts` để lấy `Repository<Department>`
 * mà không cần khai báo thêm provider ở module) - KHÔNG cần sửa constructor/
 * module của bất kỳ service nào đang gọi.
 */
export class DepartmentManagerHelper {
  /**
   * Danh sách id phòng ban mà `userId` đang được gán làm Manager/Assistant
   * quản lý (có thể nhiều hơn 1 phòng ban, và 1 phòng ban có thể có nhiều
   * user khác cũng được gán).
   */
  static async getManagedDepartmentIds(
    repo: Repository<DepartmentManager>,
    userId: number,
  ): Promise<number[]> {
    const rows = await repo.find({ where: { userId }, select: ['departmentId'] });
    return rows.map((r) => r.departmentId);
  }

  /** Kiểm tra `userId` có phải 1 trong các Manager của ĐÚNG `departmentId` hay không. */
  static async isManagerOfDepartment(
    repo: Repository<DepartmentManager>,
    departmentId: number,
    userId: number,
  ): Promise<boolean> {
    const row = await repo.findOne({ where: { departmentId, userId } });
    return !!row;
  }
}
