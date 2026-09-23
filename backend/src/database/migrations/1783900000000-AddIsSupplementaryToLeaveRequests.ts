import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⚠️ BỐI CẢNH: "Nghỉ phép Bổ sung" - đánh dấu 1 đơn nghỉ phép là đơn TẠO BÙ
 * khi `start_date` (ngày xin nghỉ) SỚM HƠN ngày tạo đơn (`created_at`) -
 * dùng cho case User quên tạo đơn TRƯỚC ngày nghỉ, giờ vào tạo bù lại cho
 * đúng ngày đã nghỉ. Cờ này được tính TỰ ĐỘNG, 1 LẦN DUY NHẤT lúc
 * `LeaveRequestsService.create()` (xem `computeIsSupplementary()`), KHÔNG
 * tính lại khi `update()` - đây là dấu vết lịch sử tại thời điểm tạo đơn.
 *
 * FE hiển thị Tag "Đơn bổ sung" ngay cạnh cột "Loại phép" khi cờ này = true
 * (trang `/nghi-phep` và `/duyet-phep`).
 *
 * Cột kiểu TINYINT(1) NOT NULL DEFAULT 0 - toàn bộ đơn cũ mặc định = false
 * (không hồi tố, chỉ áp dụng cho đơn tạo mới sau migration này).
 */
export class AddIsSupplementaryToLeaveRequests1783800000000
  implements MigrationInterface
{
  name = 'AddIsSupplementaryToLeaveRequests1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leave_requests');

    // MySQL không hỗ trợ "ADD COLUMN IF NOT EXISTS" - kiểm tra tồn tại
    // trước qua getTable(), đúng pattern các migration leave_requests trước.
    if (!table?.findColumnByName('is_supplementary')) {
      await queryRunner.query(`
        ALTER TABLE leave_requests
        ADD COLUMN is_supplementary TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Đơn bổ sung - start_date sớm hơn ngày tạo đơn (tạo bù, quên tạo trước)'
        AFTER reason;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leave_requests');

    if (table?.findColumnByName('is_supplementary')) {
      await queryRunner.query(`ALTER TABLE leave_requests DROP COLUMN is_supplementary;`);
    }
  }
}
