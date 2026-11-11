import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS - M4: seed 8 permission mới + 1 setting. Chạy TRƯỚC khi deploy code dùng key (X20).
 * Mọi dòng seed khai rõ Toàn cục (`department_id IS NULL AND position_id IS NULL`) - KHÔNG đụng override phòng ban.
 *
 *   fanpages.export            scope   admin/assistant=all manager=department employee=own   (Q9: như fanpages.view)
 *   fanpage_metrics.manage     scope   như fanpages.view
 *   fanpage_metrics.delete     scope   CHỈ admin=all
 *   fanpage_stats.view         scope   như fanpages.view
 *   fanpage_rankings.view      scope   admin/assistant=all manager=department, employee KHÔNG
 *   fanpage_revenue.view       scope   admin/assistant=all manager=department, employee KHÔNG
 *   fanpage_statuses.manage    nhị phân admin, assistant
 *   fanpage_post_types.manage  nhị phân admin, assistant
 *   setting `fanpage.silent_days` = 3 (không ghi đè giá trị đã có).
 * Idempotent. down() xoá theo key (role_permissions rồi permissions) và setting.
 */
export class SeedFanpageAnalyticsPermissions1786391000000 implements MigrationInterface {
    name = 'SeedFanpageAnalyticsPermissions1786391000000';

    private static readonly KEYS = [
        'fanpages.export',
        'fanpage_metrics.manage',
        'fanpage_metrics.delete',
        'fanpage_stats.view',
        'fanpage_rankings.view',
        'fanpage_revenue.view',
        'fanpage_statuses.manage',
        'fanpage_post_types.manage',
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('fanpages.export', 'fanpages', 'export', TRUE, 'Xuất Excel danh sách Fanpage (theo scope người phụ trách)'),
      ('fanpage_metrics.manage', 'fanpage_metrics', 'manage', TRUE, 'Nhập/sửa số liệu định kỳ của Fanpage (follower, reach...) và mục tiêu tháng'),
      ('fanpage_metrics.delete', 'fanpage_metrics', 'delete', TRUE, 'Xoá số liệu định kỳ của Fanpage - mặc định chỉ Admin'),
      ('fanpage_stats.view', 'fanpage_stats', 'view', TRUE, 'Xem tab Thống kê Fanpage (tăng trưởng, nhịp đăng, top bài, Page → khách)'),
      ('fanpage_rankings.view', 'fanpage_rankings', 'view', TRUE, 'Xem xếp hạng đóng góp của người phụ trách Fanpage (own = chỉ dòng mình)'),
      ('fanpage_revenue.view', 'fanpage_revenue', 'view', TRUE, 'Xem tiền nạp quy theo Page (vẫn bị chặn bởi phạm vi khách hàng và UI Visibility tab:deposits)'),
      ('fanpage_statuses.manage', 'fanpage_statuses', 'manage', FALSE, 'Thêm/sửa/khoá-mở danh mục Tình trạng Page'),
      ('fanpage_post_types.manage', 'fanpage_post_types', 'manage', FALSE, 'Thêm/sửa/khoá-mở danh mục Loại bài đăng Fanpage')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

        // [roleCode, permissionKey, scope|null]
        const rows: Array<[string, string, string | null]> = [];
        for (const key of ['fanpages.export', 'fanpage_metrics.manage', 'fanpage_stats.view']) {
            rows.push(['admin', key, 'all'], ['assistant', key, 'all'], ['manager', key, 'department'], ['employee', key, 'own']);
        }
        rows.push(['admin', 'fanpage_metrics.delete', 'all']);
        for (const key of ['fanpage_rankings.view', 'fanpage_revenue.view']) {
            rows.push(['admin', key, 'all'], ['assistant', key, 'all'], ['manager', key, 'department']);
        }
        for (const key of ['fanpage_statuses.manage', 'fanpage_post_types.manage']) {
            rows.push(['admin', key, null], ['assistant', key, null]);
        }

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

        await queryRunner.query(`
      INSERT INTO settings (\`key\`, value, description) VALUES
      ('fanpage.silent_days', '3', 'Fanpage: số ngày liên tiếp không đăng bài thì Page bị coi là "im lặng" (1-30)')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const keys = SeedFanpageAnalyticsPermissions1786391000000.KEYS;
        const ph = keys.map(() => '?').join(',');
        await queryRunner.query(
            `DELETE rp FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.\`key\` IN (${ph})`,
            keys,
        );
        await queryRunner.query(`DELETE FROM permissions WHERE \`key\` IN (${ph})`, keys);
        await queryRunner.query(`DELETE FROM settings WHERE \`key\` = 'fanpage.silent_days'`);
    }
}