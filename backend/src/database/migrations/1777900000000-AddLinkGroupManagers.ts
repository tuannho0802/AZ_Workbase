import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cơ chế "Quản lý chính + phụ" cho TỪNG LinkGroup (không phải
 * LinkCategory) - giống hệt tinh thần "Sales chính + Sales được chia" ở
 * Customer, nhưng đơn giản hơn (không cần audit trail transferred/reclaimed
 * như `customer_assignments` - ở đây chỉ cần add/remove thuần tuý):
 *
 *   link_groups.primary_manager_id  - "Quản lý chính", 1 user duy nhất,
 *     giống cột `sales_user_id` trên `customers`. Chỉ ADMIN được set/đổi
 *     (qua PATCH /link-groups/:id) - KHÔNG phải quyền của chính người quản
 *     lý, tương tự việc 1 sales không tự gán mình làm sales chính được.
 *
 *   link_group_secondary_managers    - "Quản lý phụ", NHIỀU user cho 1
 *     group, bảng join đơn giản (KHÔNG có trạng thái transferred/reclaimed
 *     như customer_assignments vì yêu cầu chỉ cần add/remove thuần tuý).
 *     Quản lý CHÍNH (hoặc admin) có quyền thêm/xoá người ở bảng này - xem
 *     LinkGroupManagersService.
 *
 * Mục đích nghiệp vụ: mỗi Group (1 link Zalo/FB/Threads cụ thể) cần 1 hoặc
 * nhiều nhân viên chịu trách nhiệm quản lý - và trang "Quản lý nhóm liên
 * kết" sẽ chỉ hiện NHÓM MÀ USER ĐÓ ĐƯỢC GÁN (chính hoặc phụ) cho user
 * thường; admin vẫn thấy/quản lý được tất cả như trước.
 */
export class AddLinkGroupManagers1777900000000 implements MigrationInterface {
  name = 'AddLinkGroupManagers1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPrimaryManagerColumn = await queryRunner.hasColumn('link_groups', 'primary_manager_id');
    if (!hasPrimaryManagerColumn) {
      await queryRunner.query(`
        ALTER TABLE \`link_groups\`
        ADD COLUMN \`primary_manager_id\` INT NULL COMMENT 'Quản lý chính của nhóm này' AFTER \`is_active\`,
        ADD CONSTRAINT \`FK_link_groups_primary_manager\` FOREIGN KEY (\`primary_manager_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        ADD INDEX \`IDX_link_groups_primary_manager_id\` (\`primary_manager_id\`);
      `);
    }

    const hasSecondaryTable = await queryRunner.hasTable('link_group_secondary_managers');
    if (!hasSecondaryTable) {
      await queryRunner.query(`
        CREATE TABLE \`link_group_secondary_managers\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`group_id\` int NOT NULL,
          \`user_id\` int NOT NULL,
          \`added_by_id\` int NULL DEFAULT NULL,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_lgsm_group_user\` (\`group_id\`, \`user_id\`),
          KEY \`IDX_lgsm_user\` (\`user_id\`),
          CONSTRAINT \`FK_lgsm_group\` FOREIGN KEY (\`group_id\`)
            REFERENCES \`link_groups\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_lgsm_user\` FOREIGN KEY (\`user_id\`)
            REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_lgsm_added_by\` FOREIGN KEY (\`added_by_id\`)
            REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('link_group_secondary_managers')) {
      await queryRunner.query(`DROP TABLE \`link_group_secondary_managers\`;`);
    }
    const hasPrimaryManagerColumn = await queryRunner.hasColumn('link_groups', 'primary_manager_id');
    if (hasPrimaryManagerColumn) {
      await queryRunner.query(`
        ALTER TABLE \`link_groups\`
        DROP FOREIGN KEY \`FK_link_groups_primary_manager\`,
        DROP INDEX \`IDX_link_groups_primary_manager_id\`,
        DROP COLUMN \`primary_manager_id\`;
      `);
    }
  }
}
