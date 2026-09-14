import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 (1/3) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 6 (Phase 1) + mục 7
 * (danh sách migration dự kiến).
 *
 * Tạo bảng catalog động `periodic_task_statuses`, mirror ĐÚNG pattern
 * `CreateCustomerStatuses1781400000000` (Admin tự CRUD trạng thái, không
 * ENUM cứng) - seed 3 trạng thái hệ thống mặc định theo đúng yêu cầu chủ dự
 * án: "Chưa hoàn thành / Hoàn thành / Không hoàn thành".
 *
 * `is_done_state`/`is_excluded_from_rollup` phục vụ tính % rollup ở Phase 2
 * (PLAN mục 2.3) - seed sẵn giá trị đúng ngay từ đầu để Phase 2 dùng được
 * ngay, không cần migration sửa lại dữ liệu.
 */
export class CreatePeriodicTaskStatuses1781900000000 implements MigrationInterface {
  name = 'CreatePeriodicTaskStatuses1781900000000';

  private readonly seedStatuses: {
    code: string;
    name: string;
    description: string | null;
    color: string;
    sortOrder: number;
    isDoneState: boolean;
    isExcludedFromRollup: boolean;
  }[] = [
    {
      code: 'not_started',
      name: 'Chưa hoàn thành',
      description: 'Trạng thái mặc định khi vừa tạo Task',
      color: '#faad14',
      sortOrder: 1,
      isDoneState: false,
      isExcludedFromRollup: false,
    },
    {
      code: 'completed',
      name: 'Hoàn thành',
      description: null,
      color: '#52c41a',
      sortOrder: 2,
      isDoneState: true,
      isExcludedFromRollup: false,
    },
    {
      code: 'not_completed',
      name: 'Không hoàn thành',
      description: null,
      color: '#f5222d',
      sortOrder: 3,
      isDoneState: false,
      isExcludedFromRollup: false,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_task_statuses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255) NULL,
        is_system TINYINT NOT NULL DEFAULT 0,
        color VARCHAR(20) NOT NULL DEFAULT '#1890ff',
        sort_order INT NOT NULL DEFAULT 0,
        is_done_state TINYINT NOT NULL DEFAULT 0,
        is_excluded_from_rollup TINYINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_periodic_task_statuses_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Idempotent qua ON DUPLICATE KEY UPDATE (an toàn nếu migration chạy lại
    // nhiều lần trong lúc nhiều tài khoản cùng migrate) - is_system CHỈ set
    // khi INSERT mới, không ghi đè nếu Admin đã lỡ đổi tay.
    for (const s of this.seedStatuses) {
      await queryRunner.query(
        `INSERT INTO periodic_task_statuses
           (code, name, description, is_system, color, sort_order, is_done_state, is_excluded_from_rollup)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           description = VALUES(description),
           color = VALUES(color),
           sort_order = VALUES(sort_order),
           is_done_state = VALUES(is_done_state),
           is_excluded_from_rollup = VALUES(is_excluded_from_rollup);`,
        [s.code, s.name, s.description, s.color, s.sortOrder, s.isDoneState ? 1 : 0, s.isExcludedFromRollup ? 1 : 0],
      );
    }

    // Permission CRUD cho module status - mirror đúng bộ 3 quyền
    // view/manage/delete của customer_statuses/media_sources/positions.
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_task_statuses.view', 'periodic_task_statuses', 'view', FALSE, 'Xem danh sách Trạng thái công việc định kỳ'),
      ('periodic_task_statuses.manage', 'periodic_task_statuses', 'manage', FALSE, 'Tạo/sửa Trạng thái công việc định kỳ'),
      ('periodic_task_statuses.delete', 'periodic_task_statuses', 'delete', FALSE, 'Xoá Trạng thái công việc định kỳ - chỉ Admin')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Xem (dropdown chọn trạng thái khi tạo/sửa Task): mọi role đã đăng
    // nhập - mirror customer_statuses.view/media_sources.view.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager', 'employee')
        AND p.key = 'periodic_task_statuses.view';
    `);

    // Tạo/sửa: Admin + Assistant.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.key = 'periodic_task_statuses.manage';
    `);

    // Xoá: chỉ Admin.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.key = 'periodic_task_statuses.delete';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key IN (
        'periodic_task_statuses.view', 'periodic_task_statuses.manage', 'periodic_task_statuses.delete'
      );
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'periodic_task_statuses.view', 'periodic_task_statuses.manage', 'periodic_task_statuses.delete'
      );
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_task_statuses`);
  }
}
