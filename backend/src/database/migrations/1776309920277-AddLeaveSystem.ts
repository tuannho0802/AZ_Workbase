import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLeaveSystem1776309920277 implements MigrationInterface {
    name = 'AddLeaveSystem1776309920277'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`leave_requests\` (\`id\` int NOT NULL AUTO_INCREMENT, \`requester_id\` int NOT NULL COMMENT 'Người xin nghỉ', \`approver_id\` int NULL COMMENT 'Người duyệt (Manager/Admin)', \`leave_type\` enum ('annual', 'sick', 'maternity', 'unpaid', 'compensatory') NOT NULL COMMENT 'Loại nghỉ phép', \`duration\` enum ('full_day', 'half_day_am', 'half_day_pm') NOT NULL COMMENT 'Thời lượng nghỉ trong ngày' DEFAULT 'full_day', \`start_date\` date NOT NULL COMMENT 'Ngày bắt đầu nghỉ', \`end_date\` date NOT NULL COMMENT 'Ngày kết thúc nghỉ', \`total_days\` decimal(4,1) NOT NULL COMMENT 'Tổng số ngày nghỉ (tính cả 0.5 cho half day)', \`reason\` text NOT NULL COMMENT 'Lý do xin nghỉ', \`rejection_reason\` text NULL COMMENT 'Lý do từ chối (nếu rejected)', \`status\` enum ('pending', 'approved', 'rejected', 'cancelled') NOT NULL COMMENT 'Trạng thái đơn' DEFAULT 'pending', \`attachment_url\` varchar(500) NULL COMMENT 'Link file đính kèm (giấy bác sĩ, v.v.)', \`created_at\` datetime(6) NOT NULL COMMENT 'Ngày tạo đơn' DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`approved_at\` datetime NULL COMMENT 'Thời điểm duyệt', \`rejected_at\` datetime NULL COMMENT 'Thời điểm từ chối', \`cancelled_at\` datetime NULL COMMENT 'Thời điểm hủy (bởi user)', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`annual_leave_balance\` decimal(4,1) NOT NULL COMMENT 'Số ngày phép năm còn lại' DEFAULT '12.0'`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`annual_leave_total\` decimal(4,1) NOT NULL COMMENT 'Tổng ngày phép năm ban đầu' DEFAULT '12.0'`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`compensatory_leave_balance\` decimal(4,1) NOT NULL COMMENT 'Số ngày nghỉ bù tích lũy' DEFAULT '0.0'`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`leave_year\` int NOT NULL COMMENT 'Năm áp dụng quỹ phép hiện tại' DEFAULT 2026`);
        await queryRunner.query(`ALTER TABLE \`leave_requests\` ADD CONSTRAINT \`FK_ea1ef783333d525f2a5fd0bfef4\` FOREIGN KEY (\`requester_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`leave_requests\` ADD CONSTRAINT \`FK_c46c950aa343c4598ed7042c1b7\` FOREIGN KEY (\`approver_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`leave_requests\` DROP FOREIGN KEY \`FK_c46c950aa343c4598ed7042c1b7\``);
        await queryRunner.query(`ALTER TABLE \`leave_requests\` DROP FOREIGN KEY \`FK_ea1ef783333d525f2a5fd0bfef4\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`leave_year\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`compensatory_leave_balance\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`annual_leave_total\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`annual_leave_balance\``);
        await queryRunner.query(`DROP TABLE \`leave_requests\``);
    }
}
