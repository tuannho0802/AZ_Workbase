import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D2 (PLAN_GUIDES_CONTENT) - Hướng dẫn có thể yêu cầu 1 permission để được xem.
 *
 *  - `guides.required_permission` (varchar(100) NULL): key trong bảng `permissions` (vd `customers.assign`).
 *    NULL = không yêu cầu quyền (hành vi cũ, mọi guide hiện có giữ nguyên).
 *
 * Quy tắc xem (AND thêm 1 chiều nữa với role / vị trí / phòng ban): người xem phải đang CÓ permission đó
 * (qua ma trận quyền động, đã tính override phòng ban + vị trí). Người có `guides.manage` vẫn xem mọi guide đã xuất bản.
 * Cố ý KHÔNG tạo FK sang `permissions.key`: BE validate khi ghi, và khi đọc key không còn tồn tại = ẩn với
 * người không có `guides.manage` (an toàn mặc định).
 *
 * Idempotent (hasColumn). `down()` xoá cột (mất cấu hình quyền của guide, không mất nội dung).
 */
export class AddGuideRequiredPermission1785700000000 implements MigrationInterface {
  name = 'AddGuideRequiredPermission1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('guides', 'required_permission'))) {
      await queryRunner.query(`ALTER TABLE \`guides\` ADD COLUMN \`required_permission\` varchar(100) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('guides', 'required_permission')) {
      await queryRunner.query(`ALTER TABLE \`guides\` DROP COLUMN \`required_permission\``);
    }
  }
}
