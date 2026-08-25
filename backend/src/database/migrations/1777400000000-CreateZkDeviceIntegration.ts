import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateZkDeviceIntegration1777400000000
  implements MigrationInterface
{
  name = 'CreateZkDeviceIntegration1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Thêm cột map user -> mã user trên máy chấm công.
    // ⚠️ KHÔNG dùng "AFTER <cột nào đó>": vị trí cột trong bảng không ảnh
    // hưởng gì tới hoạt động, và tránh phụ thuộc vào cột khác có tồn tại
    // hay không tại thời điểm chạy migration này.
    const hasColumn = await queryRunner.hasColumn(
      'users',
      'zk_device_user_id',
    );
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD COLUMN \`zk_device_user_id\` varchar(50) NULL
        COMMENT 'Mã User ID trên máy chấm công - dùng để map log chấm công về đúng nhân viên';
      `);
    }

    // 2. Tạo bảng lưu log chấm công thô.
    // - UQ_device_pull_log: khoá dedupe cho log lấy qua PULL (node-zklib,
    //   chỉ chạy tay khi admin ở cùng LAN/VPN với máy) - dùng userSn (số
    //   thứ tự log ngay trên máy).
    // - UQ_device_push_log: khoá dedupe cho log máy tự đẩy qua ADMS Push
    //   (nguồn chính, tự động) - không có userSn nên dùng
    //   (mã máy, mã user trên máy, giờ chấm công) làm khoá thay thế.
    // Cả 2 cùng tồn tại vì MySQL cho phép nhiều dòng NULL trong 1 unique
    // index (không tính là trùng) - mỗi dòng dữ liệu chỉ khớp 1 trong 2 khoá
    // tuỳ theo nguồn (source).
    const hasTable = await queryRunner.hasTable('attendance_logs');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`attendance_logs\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`device_serial_number\` varchar(50) NOT NULL,
          \`device_user_id\` varchar(50) NOT NULL,
          \`user_sn\` int NULL,
          \`record_time\` timestamp NOT NULL,
          \`status_code\` varchar(10) NULL,
          \`verify_mode\` varchar(10) NULL,
          \`matched_user_id\` int NULL,
          \`source\` enum('device_pull','device_push') NOT NULL DEFAULT 'device_push',
          \`synced_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_device_pull_log\` (\`device_serial_number\`, \`user_sn\`),
          UNIQUE KEY \`UQ_device_push_log\` (\`device_serial_number\`, \`device_user_id\`, \`record_time\`),
          KEY \`IDX_matched_user_record_time\` (\`matched_user_id\`, \`record_time\`),
          CONSTRAINT \`FK_attendance_logs_matched_user\`
            FOREIGN KEY (\`matched_user_id\`) REFERENCES \`users\` (\`id\`)
            ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('attendance_logs');
    if (hasTable) {
      await queryRunner.query(`DROP TABLE \`attendance_logs\`;`);
    }

    const hasColumn = await queryRunner.hasColumn(
      'users',
      'zk_device_user_id',
    );
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\` DROP COLUMN \`zk_device_user_id\`;
      `);
    }
  }
}