import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tách quyền XOÁ Vị trí ra khỏi `positions.manage` (trước đây `positions.manage`
 * gate CHUNG cả tạo/sửa/xoá) - đúng yêu cầu chủ dự án "đủ CRUD, đủ permission để
 * Admin bật/tắt chi tiết từng quyền" (xem WORKFLOW_LOG.md 2026-09-10, audit BE
 * Position trước khi làm FE).
 *
 * Mirror ĐÚNG pattern đã có sẵn cho `departments.view`/`departments.manage`/
 * `departments.delete` (xem AddDetailedRbacPermissions1778600000000): xoá là
 * hành động nguy hiểm hơn tạo/sửa (mất dữ liệu, dù PositionsService.remove()
 * đã chặn nếu đang có User gán) - tách riêng để Admin có thể cấp
 * `positions.manage` (tạo/sửa) cho Assistant mà KHÔNG kèm quyền xoá, đúng tinh
 * thần least-privilege.
 *
 * `positions.manage` GIỮ NGUYÊN vai trò tạo/sửa (POST/PATCH), không đổi gì ở
 * đây - chỉ đổi decorator của riêng endpoint DELETE trong
 * `positions.controller.ts` (xem commit cùng migration này).
 */
export class AddPositionsDeletePermission1780600000000
  implements MigrationInterface
{
  name = 'AddPositionsDeletePermission1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('positions.delete', 'positions', 'delete', FALSE, 'Xoá Vị trí (Position)')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Chỉ Admin, đúng pattern departments.delete - KHÔNG gán cho Assistant dù
    // Assistant đang có positions.manage (tạo/sửa), giữ đúng ranh giới
    // "tạo/sửa" vs "xoá" mà migration này tách ra.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key = 'positions.delete'
        AND r.code = 'admin';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = 'positions.delete';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'positions.delete'`);
  }
}
