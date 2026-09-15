import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 (1/1) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 3 (schema) + mục 4
 * (permission) + mục 6 (Phase 3).
 *
 * 1. Tạo bảng `periodic_task_customers` (N-N Task <-> Customer) -
 *    `UNIQUE(task_id, customer_id)` chặn trùng ở tầng DB (idempotent add).
 * 2. Seed permission NHỊ PHÂN (supports_scope = FALSE, mirror
 *    `periodic_task_statuses.manage`) `periodic_tasks.link_customer` - bật/
 *    tắt TÍNH NĂNG gắn Khách hàng vào Task (PLAN mục 2.4/2.12). Giá trị seed
 *    CHỈ là khởi tạo mặc định: admin/assistant = bật, manager/employee =
 *    KHÔNG seed (tắt) - Admin có thể đổi tự do qua `/phan-quyen` sau đó,
 *    không có ngoại lệ code cứng nào ngoài Root Admin.
 *
 * ⚠️ Danh sách Customer để CHỌN + field `linkedCustomers` ở response vẫn
 * phải chạy qua `CustomerAccessHelper.applyViewFilter()` với scope thật của
 * permission `customers.view` (đã seed từ trước ở module customers, KHÔNG
 * đụng lại ở đây) - xem `PeriodicTaskCustomersService`.
 */
export class CreatePeriodicTaskCustomers1782400000000 implements MigrationInterface {
  name = 'CreatePeriodicTaskCustomers1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_task_customers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        task_id INT NOT NULL,
        customer_id INT NOT NULL,
        linked_by_id INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        UNIQUE KEY uk_periodic_task_customers_task_customer (task_id, customer_id),
        INDEX idx_periodic_task_customers_task (task_id),
        INDEX idx_periodic_task_customers_customer (customer_id),

        CONSTRAINT fk_periodic_task_customers_task
          FOREIGN KEY (task_id) REFERENCES periodic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_customers_customer
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_customers_linked_by
          FOREIGN KEY (linked_by_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_tasks.link_customer', 'periodic_tasks', 'link_customer', FALSE, 'Bật/tắt tính năng gắn Khách hàng vào Công việc định kỳ')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Giá trị khởi tạo: admin/assistant = bật (scope=NULL, binary). manager/
    // employee KHÔNG seed dòng nào -> mặc định tắt, Admin tự bật qua UI nếu muốn.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.\`key\` = 'periodic_tasks.link_customer';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` = 'periodic_tasks.link_customer';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'periodic_tasks.link_customer'`);
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_task_customers`);
  }
}
