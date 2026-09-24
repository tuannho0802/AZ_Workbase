import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `periodic_tasks.delete` không còn "chỉ Admin": từ 2026-09-24 xoá Task theo
 * scope own/department/all (`PeriodicTasksService.remove()`), nên chỉ cập nhật
 * MÔ TẢ hiển thị ở ma trận Phân quyền cho khỏi gây hiểu nhầm. KHÔNG đổi
 * `role_permissions` - Admin tự cấu hình role nào được xoá ở trang Phân quyền.
 */
export class UpdatePeriodicTasksDeleteDescription1784200000000 implements MigrationInterface {
  name = 'UpdatePeriodicTasksDeleteDescription1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE permissions SET description = ? WHERE \`key\` = 'periodic_tasks.delete'`,
      ['Xoá mềm Công việc định kỳ - theo phạm vi (Chỉ của mình = Task mình tạo/phụ trách chính). Phạm vi Toàn bộ mới được dọn dẹp lịch sử'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE permissions SET description = ? WHERE \`key\` = 'periodic_tasks.delete'`,
      ['Xoá mềm Công việc định kỳ - chỉ Admin'],
    );
  }
}
