import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permission cho tính năng "Hiệu suất công việc" (thống kê % hoàn thành /
 * hoàn thành muộn theo User của module `periodic_tasks`).
 *
 * ⚠️ KHÁC mọi permission `periodic_tasks.*` khác: đây là quyền "View bật/tắt"
 * đúng nghĩa đen theo yêu cầu chủ dự án - KHÔNG gate cứng ở `PermissionGuard`
 * (route KHÔNG gắn `@RequirePermission()`), vì "tắt" KHÔNG có nghĩa là chặn
 * hẳn, mà nghĩa là chỉ xem được hiệu suất CỦA CHÍNH MÌNH (luôn được phép,
 * giống hệt cách 1 user luôn xem được hồ sơ của chính họ). `scope`:
 *   - KHÔNG có dòng permission (mặc định) => "tắt" => chỉ xem được `own`.
 *   - scope = 'department' => xem thêm được cả phòng ban mình quản lý
 *     (`department_managers`, mirror `periodic_tasks.view`).
 *   - scope = 'all' => xem được toàn bộ User.
 * Xem `PeriodicTaskPerformanceService.resolveScope()` - nơi DUY NHẤT đọc
 * permission này, tự fallback về 'own' khi `hasPermission()` trả `allowed=false`
 * thay vì ném `ForbiddenException` như các permission khác.
 *
 * Seed mặc định: CHỈ `admin` = 'all' (mirror các permission `periodic_tasks.*`
 * khác seed cho admin ngay từ đầu). Role khác (manager/assistant/employee)
 * CỐ TÌNH không seed dòng nào - giữ đúng trạng thái "tắt" (chỉ xem của mình)
 * cho tới khi chủ dự án tự bật qua trang `/phan-quyen`.
 */
export class SeedPeriodicTasksPerformanceViewPermission1784500000000 implements MigrationInterface {
  name = 'SeedPeriodicTasksPerformanceViewPermission1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_tasks.performance_view', 'periodic_tasks', 'performance_view', TRUE,
       'Xem trang Hiệu suất công việc (Công việc định kỳ) của User KHÁC - luôn xem được của chính mình dù không có quyền này. scope=department/all mở rộng phạm vi xem theo phòng ban/toàn bộ.')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all'
      FROM roles r, permissions p
      WHERE r.code = 'admin'
        AND p.\`key\` = 'periodic_tasks.performance_view'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá permission tự CASCADE xoá role_permissions liên quan (FK ON DELETE CASCADE).
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'periodic_tasks.performance_view'`);
  }
}
