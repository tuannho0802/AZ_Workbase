import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0a - Hướng dẫn yêu cầu NHIỀU permission (trước đó chỉ 1: `guides.required_permission`, migration 1785700000000).
 *
 *  - Bảng `guide_permissions (guide_id, permission_key)`: cùng mẫu với guide_roles / guide_positions / guide_departments.
 *    Người xem phải có TẤT CẢ key của guide (AND). Không có dòng = không yêu cầu quyền.
 *  - Sao chép dữ liệu cũ: mỗi guide đang có `required_permission` -> 1 dòng trong bảng mới (hành vi giữ nguyên).
 *  - KHÔNG xoá cột `guides.required_permission` (không mất dữ liệu): từ bản này code không còn đọc/ghi cột đó;
 *    chỉ drop khi có lệnh tường minh ở migration riêng.
 *
 * Idempotent (hasTable + INSERT IGNORE). `down()` chép 1 key (nhỏ nhất theo chữ cái) về cột cũ rồi xoá bảng mới
 * -> hạ cấp xuống bản 1 quyền không làm guide bị hở (guide nhiều quyền chỉ còn giữ 1 key).
 */
export class CreateGuidePermissions1785800000000 implements MigrationInterface {
  name = 'CreateGuidePermissions1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('guide_permissions'))) {
      await queryRunner.query(`
        CREATE TABLE \`guide_permissions\` (
          \`guide_id\` int NOT NULL,
          \`permission_key\` varchar(100) NOT NULL,
          PRIMARY KEY (\`guide_id\`, \`permission_key\`),
          KEY \`idx_guide_permissions_key\` (\`permission_key\`),
          CONSTRAINT \`fk_guide_permissions_guide\` FOREIGN KEY (\`guide_id\`) REFERENCES \`guides\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
    if (await queryRunner.hasColumn('guides', 'required_permission')) {
      await queryRunner.query(`
        INSERT IGNORE INTO \`guide_permissions\` (\`guide_id\`, \`permission_key\`)
        SELECT \`id\`, \`required_permission\` FROM \`guides\`
        WHERE \`required_permission\` IS NOT NULL AND \`required_permission\` <> ''
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('guide_permissions')) {
      if (await queryRunner.hasColumn('guides', 'required_permission')) {
        await queryRunner.query(`
          UPDATE \`guides\` g
          JOIN (SELECT \`guide_id\`, MIN(\`permission_key\`) AS k FROM \`guide_permissions\` GROUP BY \`guide_id\`) p
            ON p.guide_id = g.id
          SET g.required_permission = p.k
        `);
      }
      await queryRunner.query(`DROP TABLE \`guide_permissions\``);
    }
  }
}
