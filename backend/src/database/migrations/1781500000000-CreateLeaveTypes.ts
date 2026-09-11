import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Quản lý loại phép" - bỏ ENUM cứng `leave_requests.leave_type`
 * ('annual'|'sick'|'maternity'|'unpaid'|'compensatory' - xem
 * `leave-request.entity.ts` / entity gốc), chuyển sang 1 bảng `leave_types`
 * để Admin/Assistant tự CRUD, mirror CHÍNH XÁC pattern `customer_statuses`
 * (`CreateCustomerStatuses1781400000000.ts`).
 *
 * ⚠️ SEED DATA: tái sử dụng đúng 5 `code` cũ (annual/sick/maternity/unpaid/
 * compensatory) để KHÔNG làm "mồ côi" dữ liệu `leave_requests` hiện có - đơn
 * nghỉ phép cũ tự động "thừa kế" đúng loại phép, KHÔNG cần UPDATE lại cột
 * `leave_requests.leave_type` của bất kỳ dòng nào. Thêm 2
 * loại phép MỚI theo yêu cầu: `meet_client` ("Gặp khách"), `late_arrival`
 * ("Đi trễ") - không có tương đương cũ.
 *
 * `is_paid` (hưởng lương) quyết định ký hiệu chấm công tương ứng ở bảng
 * "Tổng hợp chấm công" (xem AttendanceMonthlyTab.tsx - P/X-2 khi is_paid=true,
 * KL/1-2K khi is_paid=false). `deducts_annual_balance` giữ ĐÚNG hành vi cũ:
 * trước đây chỉ ANNUAL/SICK mới trừ `users.annual_leave_balance` khi duyệt
 * (xem `LeaveRequestsService.approve()` bản cũ) - 2 code này set true, còn
 * lại false (kể cả MATERNITY/COMPENSATORY - đúng hành vi gốc, không đổi).
 *
 * Toàn bộ INSERT dùng `ON DUPLICATE KEY UPDATE` theo khoá unique `code`, và
 * bước seed được đưa RA NGOÀI khối `if (!hasTable)` - an toàn khi chạy lại.
 *
 * ⚠️ PHẠM VI MIGRATION NÀY CHỈ LÀ NỀN TẢNG DB + PERMISSION. FE (dropdown
 * "Loại phép" cứng ở `nghi-phep/page.tsx`/`duyet-phep/page.tsx`, logic suy
 * luận P/KL/X-2/1-2K cứng theo `leaveType === 'unpaid'` ở
 * `AttendanceMonthlyTab.tsx`) cần 1 lượt riêng để "link" đọc động từ
 * `leave_types` - xem HANDOFF trong WORKFLOW_LOG.md.
 */
export class CreateLeaveTypes1781500000000 implements MigrationInterface {
  name = 'CreateLeaveTypes1781500000000';

  private readonly seedTypes: {
    code: string;
    name: string;
    description: string | null;
    color: string;
    isPaid: boolean;
    deductsAnnualBalance: boolean;
    sortOrder: number;
  }[] = [
    { code: 'annual', name: 'Phép năm', description: null, color: '#1890ff', isPaid: true, deductsAnnualBalance: true, sortOrder: 1 },
    { code: 'sick', name: 'Nghỉ ốm', description: null, color: '#faad14', isPaid: true, deductsAnnualBalance: true, sortOrder: 2 },
    { code: 'maternity', name: 'Thai sản', description: null, color: '#eb2f96', isPaid: true, deductsAnnualBalance: false, sortOrder: 3 },
    { code: 'compensatory', name: 'Nghỉ bù', description: null, color: '#13c2c2', isPaid: true, deductsAnnualBalance: false, sortOrder: 4 },
    { code: 'meet_client', name: 'Gặp khách', description: 'Ra ngoài gặp khách hàng trong giờ làm việc', color: '#52c41a', isPaid: true, deductsAnnualBalance: false, sortOrder: 5 },
    { code: 'late_arrival', name: 'Đi trễ', description: null, color: '#fa8c16', isPaid: true, deductsAnnualBalance: false, sortOrder: 6 },
    { code: 'unpaid', name: 'Không lương', description: null, color: '#8c8c8c', isPaid: false, deductsAnnualBalance: false, sortOrder: 7 },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('leave_types');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`leave_types\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`code\` varchar(50) NOT NULL,
          \`name\` varchar(100) NOT NULL,
          \`description\` varchar(255) NULL,
          \`is_system\` tinyint NOT NULL DEFAULT 0,
          \`color\` varchar(20) NOT NULL DEFAULT '#1890ff',
          \`is_paid\` tinyint NOT NULL DEFAULT 1,
          \`deducts_annual_balance\` tinyint NOT NULL DEFAULT 0,
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_leave_types_code\` (\`code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Seed/upsert LUÔN chạy (không bọc trong `if (!hasTable)`) - idempotent
    // qua ON DUPLICATE KEY UPDATE theo `code`. `is_system` CHỈ set khi INSERT
    // mới (dòng đã tồn tại giữ nguyên is_system hiện có, không bị ghi đè
    // ngược lại false nếu admin đã lỡ đổi tay).
    for (const t of this.seedTypes) {
      await queryRunner.query(
        `INSERT INTO \`leave_types\`
           (\`code\`, \`name\`, \`description\`, \`is_system\`, \`color\`, \`is_paid\`, \`deducts_annual_balance\`, \`sort_order\`)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           \`name\` = VALUES(\`name\`),
           \`description\` = VALUES(\`description\`),
           \`color\` = VALUES(\`color\`),
           \`is_paid\` = VALUES(\`is_paid\`),
           \`deducts_annual_balance\` = VALUES(\`deducts_annual_balance\`),
           \`sort_order\` = VALUES(\`sort_order\`);`,
        [t.code, t.name, t.description, t.color, t.isPaid ? 1 : 0, t.deductsAnnualBalance ? 1 : 0, t.sortOrder],
      );
    }

    // Đổi cột leave_type từ ENUM cứng -> VARCHAR tự do. Lệnh MODIFY này tự
    // idempotent - chạy lại nhiều lần không lỗi vì MySQL cho phép MODIFY về
    // cùng 1 type.
    await queryRunner.query(`
      ALTER TABLE \`leave_requests\`
      MODIFY COLUMN \`leave_type\` varchar(50) NOT NULL;
    `);

    // Seed permission CRUD cho module mới, mirror đúng bộ 3 quyền
    // view/manage/delete của customer_statuses/media_sources/positions.
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('leave_types.view', 'leave_types', 'view', FALSE, 'Xem danh sách Loại đơn nghỉ phép'),
      ('leave_types.manage', 'leave_types', 'manage', FALSE, 'Tạo/sửa Loại đơn nghỉ phép'),
      ('leave_types.delete', 'leave_types', 'delete', FALSE, 'Xoá Loại đơn nghỉ phép - chỉ Admin')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Xem được (dropdown chọn loại phép khi tạo đơn nghỉ): mọi role đã đăng
    // nhập cần dùng được, mirror đúng customer_statuses.view.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager', 'employee')
        AND p.key = 'leave_types.view';
    `);

    // Tạo/sửa: Admin + Assistant (mirror customer_statuses.manage).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.key = 'leave_types.manage';
    `);

    // Xoá: chỉ Admin (mirror customer_statuses.delete).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.key = 'leave_types.delete';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key IN ('leave_types.view', 'leave_types.manage', 'leave_types.delete');
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'leave_types.view', 'leave_types.manage', 'leave_types.delete'
      );
    `);

    // Trả lại ENUM cũ - CHỈ an toàn nếu chưa có đơn nào dùng leave_type ngoài
    // 5 giá trị gốc (giống lý luận downgrade ở CreateCustomerStatuses). Nếu
    // đã có đơn dùng `meet_client`/`late_arrival`, lệnh MODIFY bên dưới sẽ
    // lỗi "Data truncated" - đúng bản chất downgrade từ tự do về đóng cứng.
    await queryRunner.query(`
      ALTER TABLE \`leave_requests\`
      MODIFY COLUMN \`leave_type\` enum('annual','sick','maternity','unpaid','compensatory') NOT NULL;
    `);

    const hasTable = await queryRunner.hasTable('leave_types');
    if (hasTable) {
      await queryRunner.query(`DROP TABLE \`leave_types\`;`);
    }
  }
}
