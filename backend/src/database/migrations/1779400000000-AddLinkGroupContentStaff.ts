import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cơ chế "Nhân viên Content" cho TỪNG LinkGroup - CÙNG CƠ CHẾ với
 * `link_group_secondary_managers` (bảng join đơn giản, add/remove thuần
 * tuý, KHÔNG có audit trail transferred/reclaimed) nhưng tách bảng RIÊNG
 * (không gộp chung + thêm cột `type`) vì 2 lý do:
 *
 *   1. Không đụng vào ràng buộc UNIQUE(group_id, user_id) hiện có của
 *      `link_group_secondary_managers` - 1 user có thể VỪA là Quản lý phụ
 *      VỪA là Nhân viên Content của CÙNG 1 group (2 vai trò không loại trừ
 *      nhau về mặt nghiệp vụ - phụ trách nội dung khác phụ trách quản trị).
 *   2. Không phải sửa lại code/permission hiện có của tính năng Quản lý
 *      phụ đã ổn định.
 *
 * Quyền thêm/xoá: TÁI DÙNG permission `link_groups.manage` đã có sẵn (như
 * Quản lý phụ) - KHÔNG seed permission mới. Enforce ở
 * `LinkGroupManagersService.addContentStaff/removeContentStaff` qua
 * `LinkGroupAccessHelper.canEditSecondaryManagers` (chỉ Admin/role có
 * `link_groups.manage`, hoặc CHÍNH Quản lý chính của group đó).
 */
export class AddLinkGroupContentStaff1779400000000
  implements MigrationInterface
{
  name = 'AddLinkGroupContentStaff1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('link_group_content_staff');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`link_group_content_staff\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`group_id\` int NOT NULL,
          \`user_id\` int NOT NULL,
          \`added_by_id\` int NULL DEFAULT NULL,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_lgcs_group_user\` (\`group_id\`, \`user_id\`),
          KEY \`IDX_lgcs_user\` (\`user_id\`),
          CONSTRAINT \`FK_lgcs_group\` FOREIGN KEY (\`group_id\`)
            REFERENCES \`link_groups\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_lgcs_user\` FOREIGN KEY (\`user_id\`)
            REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_lgcs_added_by\` FOREIGN KEY (\`added_by_id\`)
            REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('link_group_content_staff')) {
      await queryRunner.query(`DROP TABLE \`link_group_content_staff\`;`);
    }
  }
}
