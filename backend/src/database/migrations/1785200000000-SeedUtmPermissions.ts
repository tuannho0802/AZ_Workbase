import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_UTM_MANAGEMENT - Phần 2: seed permission `utms.*` (Dynamic RBAC).
 *
 * Khác bản nháp trong plan mục 6.1 theo yêu cầu chủ dự án (2026-09-29):
 *  - Employee MẶC ĐỊNH không xem / không tạo UTM (Toàn cục không seed dòng nào cho employee).
 *  - Manager theo SCOPE phòng ban (`department`), Admin/Assistant = `all`.
 *  - Override phòng ban MARKETING cho role employee: tạo, sửa, thêm Quản lý phụ
 *    (assignee) trong phạm vi `own` (UTM mình là chính/phụ). KHÔNG có xoá - xoá chỉ Admin.
 *
 * Key & scope:
 *   utms.view       scope  Xem tab "Tất cả UTM"        admin=all assistant=all manager=department
 *   utms.create     nhị phân  Tạo UTM mới              admin, assistant, manager
 *   utms.edit       scope  Sửa tên/mô tả/màu/khoá-mở   admin=all assistant=all manager=department
 *   utms.assign     scope  Thêm/gỡ Quản lý phụ         admin=all assistant=all manager=department
 *   utms.delete     scope  Xoá UTM (0 KH tham chiếu)   CHỈ admin=all
 *   utms.my_managed nhị phân  Vào trang "Quản lý UTM"  admin, assistant, manager
 *
 * Override "Marketing" (role employee, department_id = phòng ban có tên chứa "marketing",
 * không phân biệt hoa/thường - cùng cách `CreateAssignmentGroupConfigs1781100000000` dò tên):
 *   utms.view/edit/assign = own, utms.create + utms.my_managed = bật. Không có utms.delete.
 * Nếu DB không có phòng ban nào tên "marketing" thì bước override tự bỏ qua (không lỗi).
 *
 * Idempotent: permissions dùng ON DUPLICATE KEY; role_permissions chỉ INSERT khi chưa có
 * dòng (role, permission, department_id) tương ứng. `down()` xoá theo key (CASCADE-safe).
 * Lối thoát hiểm Root Admin nằm ở PermissionGuard/RolesService, không phụ thuộc migration này.
 */
export class SeedUtmPermissions1785200000000 implements MigrationInterface {
  name = 'SeedUtmPermissions1785200000000';

  private static readonly KEYS = [
    'utms.view',
    'utms.create',
    'utms.edit',
    'utms.assign',
    'utms.delete',
    'utms.my_managed',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('utms.view', 'utms', 'view', TRUE, 'Xem tab "Tất cả UTM" trong trang Quản lý UTM (theo scope: own = UTM mình là chính/phụ, department = UTM có Quản lý chính thuộc phòng ban mình quản lý, all = tất cả)'),
      ('utms.create', 'utms', 'create', FALSE, 'Tạo UTM mới (người tạo là Quản lý chính) - gồm cả tạo nhanh trong dropdown'),
      ('utms.edit', 'utms', 'edit', TRUE, 'Sửa UTM: tên/hiển thị/chuyển chính (chỉ Quản lý chính hoặc scope rộng), mô tả/màu/khoá-mở (cả Quản lý phụ)'),
      ('utms.assign', 'utms', 'assign', TRUE, 'Thêm/gỡ Quản lý phụ (assignee) của UTM - chỉ Quản lý chính hoặc scope rộng'),
      ('utms.delete', 'utms', 'delete', TRUE, 'Xoá UTM khi không còn khách hàng tham chiếu - mặc định chỉ Admin'),
      ('utms.my_managed', 'utms', 'my_managed', FALSE, 'Vào trang "Quản lý UTM" và tab "UTM tôi quản lý"')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // ---- Toàn cục (department_id IS NULL, position_id IS NULL) ----
    // [roleCode, permissionKey, scope|null]
    const globalRows: Array<[string, string, string | null]> = [
      ['admin', 'utms.view', 'all'],
      ['assistant', 'utms.view', 'all'],
      ['manager', 'utms.view', 'department'],
      ['admin', 'utms.edit', 'all'],
      ['assistant', 'utms.edit', 'all'],
      ['manager', 'utms.edit', 'department'],
      ['admin', 'utms.assign', 'all'],
      ['assistant', 'utms.assign', 'all'],
      ['manager', 'utms.assign', 'department'],
      ['admin', 'utms.delete', 'all'],
      ['admin', 'utms.create', null],
      ['assistant', 'utms.create', null],
      ['manager', 'utms.create', null],
      ['admin', 'utms.my_managed', null],
      ['assistant', 'utms.my_managed', null],
      ['manager', 'utms.my_managed', null],
    ];
    for (const [roleCode, key, scope] of globalRows) {
      await this.insertIfMissing(queryRunner, roleCode, key, scope, null);
    }

    // ---- Override phòng ban Marketing cho employee ----
    const marketing: Array<{ id: number }> = await queryRunner.query(
      `SELECT id FROM departments WHERE LOWER(name) LIKE '%marketing%'`,
    );
    const employeeRows: Array<[string, string | null]> = [
      ['utms.view', 'own'],
      ['utms.edit', 'own'],
      ['utms.assign', 'own'],
      ['utms.create', null],
      ['utms.my_managed', null],
    ];
    for (const dept of marketing) {
      for (const [key, scope] of employeeRows) {
        await this.insertIfMissing(queryRunner, 'employee', key, scope, dept.id);
      }
    }
  }

  private async insertIfMissing(
    queryRunner: QueryRunner,
    roleCode: string,
    key: string,
    scope: string | null,
    departmentId: number | null,
  ): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO role_permissions (role_id, permission_id, scope, department_id)
      SELECT r.id, p.id, ?, ?
      FROM roles r, permissions p
      WHERE r.code = ? AND p.\`key\` = ?
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions x
          WHERE x.role_id = r.id AND x.permission_id = p.id
            AND x.department_id <=> ? AND x.position_id IS NULL
        );
      `,
      [scope, departmentId, roleCode, key, departmentId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const keys = SeedUtmPermissions1785200000000.KEYS;
    const placeholders = keys.map(() => '?').join(',');
    await queryRunner.query(
      `
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` IN (${placeholders});
      `,
      keys,
    );
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` IN (${placeholders})`, keys);
  }
}
