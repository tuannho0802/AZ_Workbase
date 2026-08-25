import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateZkDeviceIntegration1777400000000
  implements MigrationInterface
{
  name = 'CreateZkDeviceIntegration1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Thêm cột map user -> mã user trên máy chấm công
    const hasColumn = await queryRunner.hasColumn(
      'users',
      'zk_device_user_id',
    );
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD COLUMN \`zk_device_user_id\` varchar(50) NULL
        AFTER \`phone\`;
      `);
    }

    // 2. Tạo bảng lưu log chấm công thô kéo từ máy
    const hasTable = await queryRunner.hasTable('attendance_logs');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`attendance_logs\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`device_serial_number\` varchar(50) NOT NULL,
          \`device_user_id\` varchar(50) NOT NULL,
          \`user_sn\` int NOT NULL,
          \`record_time\` timestamp NOT NULL,
          \`matched_user_id\` int NULL,
          \`source\` enum('device_pull','device_push') NOT NULL DEFAULT 'device_pull',
          \`synced_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_device_log\` (\`device_serial_number\`, \`user_sn\`),
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
