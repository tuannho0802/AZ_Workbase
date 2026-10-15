import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 7: thao tác hàng loạt có Hoàn tác (hạn 5 phút).
 * Mỗi lần "đổi trạng thái hàng loạt" / "chia data hàng loạt" lưu 1 dòng gồm ảnh chụp TRƯỚC (`payload_before`)
 * và dấu vết SAU (`payload_after`) để hoàn tác. Thời gian dùng DATETIME (KHÔNG TIMESTAMP), luôn ghi bằng NOW() của DB.
 * Không có FK tới `users` (giữ bản ghi kể cả khi user bị xoá cứng; actor_id chỉ để đối chiếu quyền hoàn tác).
 */
export class CreateBulkOperations1786350000000 implements MigrationInterface {
    name = 'CreateBulkOperations1786350000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('bulk_operations')) return;
        await queryRunner.query(`
      CREATE TABLE \`bulk_operations\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`type\` VARCHAR(50) NOT NULL,
        \`actor_id\` INT NOT NULL,
        \`created_at\` DATETIME NOT NULL,
        \`expires_at\` DATETIME NOT NULL,
        \`undone_at\` DATETIME NULL,
        \`undone_by\` INT NULL,
        \`payload_before\` JSON NOT NULL,
        \`payload_after\` JSON NOT NULL,
        \`affected_count\` INT NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_bulk_operations_actor\` (\`actor_id\`, \`id\`),
        INDEX \`idx_bulk_operations_expires\` (\`expires_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('bulk_operations')) {
            await queryRunner.query(`DROP TABLE \`bulk_operations\``);
        }
    }
}