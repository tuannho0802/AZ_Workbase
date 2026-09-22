import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⚠️ BỐI CẢNH: "Period Hours" (Optional) cho Tạo đơn nghỉ phép - cho phép
 * người xin nghỉ khai báo thêm khung giờ Từ - Đến cụ thể trong ngày (vd
 * 14:00 - 17:00), TÁCH BIỆT với `duration` (full_day/half_day_am/
 * half_day_pm) đã có sẵn. KHÔNG bắt buộc, KHÔNG ảnh hưởng cách tính
 * `total_days` hiện tại (`LeaveRequestsService.calculateDays()` giữ nguyên,
 * chỉ đọc `duration`) - xem thêm comment trong `leave-request.entity.ts` và
 * `LeaveRequestsService.validatePeriodHours()`.
 *
 * 2 cột `period_start_time`/`period_end_time` kiểu TIME, NULL mặc định cho
 * toàn bộ đơn hiện có (không có Period Hours = giữ nguyên hành vi cũ).
 */
export class AddPeriodHoursToLeaveRequests1783700000000
  implements MigrationInterface
{
  name = 'AddPeriodHoursToLeaveRequests1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leave_requests');

    // MySQL không hỗ trợ "ADD COLUMN IF NOT EXISTS" - kiểm tra tồn tại
    // trước qua getTable(), đúng pattern AddLeaveApproverOverrideToUsers.
    if (!table?.findColumnByName('period_start_time')) {
      await queryRunner.query(`
        ALTER TABLE leave_requests
        ADD COLUMN period_start_time TIME NULL COMMENT 'Giờ bắt đầu (optional) - khung giờ cụ thể trong ngày, đi kèm period_end_time'
        AFTER duration;
      `);
    }

    if (!table?.findColumnByName('period_end_time')) {
      await queryRunner.query(`
        ALTER TABLE leave_requests
        ADD COLUMN period_end_time TIME NULL COMMENT 'Giờ kết thúc (optional) - đi kèm period_start_time'
        AFTER period_start_time;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leave_requests');

    if (table?.findColumnByName('period_end_time')) {
      await queryRunner.query(`ALTER TABLE leave_requests DROP COLUMN period_end_time;`);
    }

    if (table?.findColumnByName('period_start_time')) {
      await queryRunner.query(`ALTER TABLE leave_requests DROP COLUMN period_start_time;`);
    }
  }
}
