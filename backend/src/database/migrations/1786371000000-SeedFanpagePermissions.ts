import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed permission module Fanpage (Dynamic RBAC). Scope so với NGƯỜI PHỤ TRÁCH Page (`fanpages.owner_id`):
 *   own = Page mình phụ trách | department = + Page của người thuộc phòng ban mình quản lý | all = tất cả.
 *
 *   fanpages.view / edit            scope   admin=all assistant=all manager=department employee=own
 *   fanpages.create                 nhị phân admin, assistant, manager, employee
 *   fanpages.delete                 scope   CHỈ admin=all (quy tắc Xoá - PERMISSIONS.md mục 1)
 *   fanpage_posts.manage            scope   thêm/sửa bài đăng - như fanpages.view
 *   fanpage_posts.delete            scope   CHỈ admin=all
 *   fanpage_notes.manage            scope   thêm/sửa ghi chú - như fanpages.view
 *   fanpage_notes.delete            scope   CHỈ admin=all
 *   fanpage_platforms.manage        nhị phân admin, assistant (thêm/sửa/khoá nền tảng)
 *
 * Idempotent: ON DUPLICATE KEY + chỉ INSERT role_permissions khi chưa có dòng Toàn cục. down() xoá theo key.
 * Lối thoát hiểm Root Admin nằm ở PermissionGuard/RolesService, không phụ thuộc migration này.
 */
export class SeedFanpagePermissions1786371000000 implements MigrationInterface {
    name = 'SeedFanpagePermissions1786371000000';

    private static readonly KEYS = [
        'fanpages.view',
        'fanpages.create',
        'fanpages.edit',
        'fanpages.delete',
        'fanpage_posts.manage',
        'fanpage_posts.delete',
        'fanpage_notes.manage',
        'fanpage_notes.delete',
        'fanpage_platforms.manage',
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('fanpages.view', 'fanpages', 'view', TRUE, 'Xem danh sách/chi tiết Fanpage (theo scope: own = Page mình phụ trách, department = + Page của nhân viên thuộc phòng ban mình quản lý, all = tất cả)'),
      ('fanpages.create', 'fanpages', 'create', FALSE, 'Thêm Fanpage mới (người tạo mặc định là người phụ trách; giao cho người khác cần scope rộng của fanpages.edit)'),
      ('fanpages.edit', 'fanpages', 'edit', TRUE, 'Sửa thông tin Fanpage (tên, link, nền tảng, trạng thái) và đổi người phụ trách trong phạm vi scope'),
      ('fanpages.delete', 'fanpages', 'delete', TRUE, 'Xoá Fanpage (kèm toàn bộ bài đăng + ghi chú) - mặc định chỉ Admin'),
      ('fanpage_posts.manage', 'fanpage_posts', 'manage', TRUE, 'Thêm/sửa bài đăng của Fanpage (URL bài, ngày đăng, ghi chú)'),
      ('fanpage_posts.delete', 'fanpage_posts', 'delete', TRUE, 'Xoá bài đăng của Fanpage - mặc định chỉ Admin'),
      ('fanpage_notes.manage', 'fanpage_notes', 'manage', TRUE, 'Thêm/sửa ghi chú tiến trình của Fanpage'),
      ('fanpage_notes.delete', 'fanpage_notes', 'delete', TRUE, 'Xoá ghi chú tiến trình của Fanpage - mặc định chỉ Admin'),
      ('fanpage_platforms.manage', 'fanpage_platforms', 'manage', FALSE, 'Thêm/sửa/khoá-mở nền tảng của Fanpage (Facebook, TikTok...)')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

        // [roleCode, permissionKey, scope|null]
        const scoped = ['fanpages.view', 'fanpages.edit', 'fanpage_posts.manage', 'fanpage_notes.manage'];
        const rows: Array<[string, string, string | null]> = [];
        for (const key of scoped) {
            rows.push(['admin', key, 'all'], ['assistant', key, 'all'], ['manager', key, 'department'], ['employee', key, 'own']);
        }
        for (const key of ['fanpages.delete', 'fanpage_posts.delete', 'fanpage_notes.delete']) {
            rows.push(['admin', key, 'all']);
        }
        for (const role of ['admin', 'assistant', 'manager', 'employee']) rows.push([role, 'fanpages.create', null]);
        for (const role of ['admin', 'assistant']) rows.push([role, 'fanpage_platforms.manage', null]);

        for (const [roleCode, key, scope] of rows) {
            await queryRunner.query(
                `
        INSERT INTO role_permissions (role_id, permission_id, scope, department_id)
        SELECT r.id, p.id, ?, NULL
        FROM roles r, permissions p
        WHERE r.code = ? AND p.\`key\` = ?
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions x
            WHERE x.role_id = r.id AND x.permission_id = p.id
              AND x.department_id IS NULL AND x.position_id IS NULL
          );
        `,
                [scope, roleCode, key],
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const keys = SeedFanpagePermissions1786371000000.KEYS;
        const ph = keys.map(() => '?').join(',');
        await queryRunner.query(
            `DELETE rp FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.\`key\` IN (${ph})`,
            keys,
        );
        await queryRunner.query(`DELETE FROM permissions WHERE \`key\` IN (${ph})`, keys);
    }
}