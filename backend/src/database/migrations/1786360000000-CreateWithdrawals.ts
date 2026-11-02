import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_WITHDRAWAL_LEAVE_EXPORT - Phase W1: bảng `withdrawals` (phiếu RÚT tiền của khách hàng).
 *
 * CHỈ tạo bảng - KHÔNG seed permission: rút tiền dùng lại `customers.edit` (tạo/sửa ghi chú),
 * `customers.view` (xem) và `customers.delete` (xoá) theo quyết định đã chốt.
 * Cột thời gian DATETIME(6) khớp mặc định của @CreateDateColumn/@UpdateDateColumn của TypeORM
 * (để `migration:generate` sau này không sinh diff thừa). `amount` DECIMAL(15,2) như `deposits`.
 */
export class CreateWithdrawals1786360000000 implements MigrationInterface {
    name = 'CreateWithdrawals1786360000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('withdrawals')) return;
        await queryRunner.query(`
      CREATE TABLE \`withdrawals\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`customer_id\` INT NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL,
        \`withdrawal_date\` DATE NOT NULL,
        \`broker\` VARCHAR(100) NULL,
        \`note\` TEXT NULL,
        \`created_by_id\` INT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_withdrawals_customer_date\` (\`customer_id\`, \`withdrawal_date\`),
        INDEX \`idx_withdrawals_date\` (\`withdrawal_date\`),
        CONSTRAINT \`FK_withdrawals_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_withdrawals_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('withdrawals')) {
            await queryRunner.query(`DROP TABLE \`withdrawals\``);
        }
    }
}
