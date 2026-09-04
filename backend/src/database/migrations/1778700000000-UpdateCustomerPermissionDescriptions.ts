import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCustomerPermissionDescriptions1778700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE permissions SET description = 'Xem danh sách và chi tiết khách hàng' WHERE \`key\` = 'customers.view'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Tạo mới, chỉnh sửa thông tin khách hàng' WHERE \`key\` = 'customers.manage'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Thêm ghi chú, lịch sử chăm sóc khách hàng' WHERE \`key\` = 'customers.note'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Giao khách hàng cho nhân viên Sales khác' WHERE \`key\` = 'customers.assign'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Tải lên danh sách khách hàng từ file Excel' WHERE \`key\` = 'customers.import'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Xem danh sách khách hàng bị trùng lặp/lỗi (dành cho Admin)' WHERE \`key\` = 'customers.invalid_report'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Quản lý thùng rác: khôi phục hoặc xoá vĩnh viễn (dành cho Admin)' WHERE \`key\` = 'customers.trash_manage'`);
    await queryRunner.query(`UPDATE permissions SET description = 'Xoá khách hàng (đưa vào thùng rác)' WHERE \`key\` = 'customers.delete'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Không cần rollback chi tiết mô tả
  }
}
