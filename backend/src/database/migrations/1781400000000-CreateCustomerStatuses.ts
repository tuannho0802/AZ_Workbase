import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Quản lý status Khách" - bỏ ENUM cứng `customers.status`
 * ('closed'|'pending'|'potential'|'lost'|'inactive' - xem
 * `customer.entity.ts` / `CreateCustomersTable1710000000000`), chuyển sang 1
 * bảng `customer_statuses` để Admin tự CRUD, mirror pattern `media_sources`
 * (`CreateMediaSources1777700000000.ts`) và `positions`
 * (`AddPositionsTable1780300000000.ts`).
 *
 * ⚠️ SEED DATA MỚI (yêu cầu thay bộ 5 trạng thái cũ bằng bộ 8 trạng thái mới:
 * Chờ xử lý/Đã mở Tài khoản/Đã chốt/Deal Tiềm Năng/Liên hệ lại sau/Deadlead/
 * Đang chăm sóc nhóm/IB) - để KHÔNG làm "mồ côi" dữ liệu (customer cũ đang có
 * `status` = 1 trong 5 giá trị ENUM gốc), migration này áp dụng nguyên tắc:
 *   - KHÔNG xoá bất kỳ `code` cũ nào. Với 4/8 trạng thái mới có Ý NGHĨA
 *     TRÙNG với 1 trạng thái cũ, TÁI SỬ DỤNG lại đúng `code` cũ, chỉ đổi
 *     `name` hiển thị - customer cũ tự động "thừa kế" tên mới, KHÔNG cần
 *     UPDATE lại cột `customers.status` của bất kỳ dòng nào:
 *       code cũ 'pending'   (name cũ "Chờ xử lý")  -> name mới "Chờ xử lý" (giữ nguyên, vẫn là mặc định)
 *       code cũ 'closed'    (name cũ "Đã chốt")    -> name mới "Đã chốt" (giữ nguyên)
 *       code cũ 'potential' (name cũ "Tiềm năng")  -> name mới "Deal Tiềm Năng"
 *       code cũ 'lost'      (name cũ "Mất")        -> name mới "Deadlead"
 *   - 4 trạng thái mới hoàn toàn không có tương đương cũ ("Đã mở Tài khoản",
 *     "Liên hệ lại sau", "Đang chăm sóc nhóm", "IB") -> INSERT thêm với code
 *     mới, is_system = TRUE (đây là bộ mặc định chính thức thay thế ENUM,
 *     không phải do 1 Admin tự thêm sau này).
 *   - Riêng code cũ 'inactive' (name "Ngừng chăm sóc") KHÔNG nằm trong danh
 *     sách 8 trạng thái mới được yêu cầu - GIỮ NGUYÊN, KHÔNG xoá, KHÔNG đổi
 *     tên, chỉ đẩy xuống cuối danh sách hiển thị (sort_order cao). Đây là
 *     QUYẾT ĐỊNH THIẾT KẾ CÓ CHỦ Ý để tránh mất dấu bất kỳ customer nào đang
 *     có `status = 'inactive'` trong DB thật (bảng customer_statuses không
 *     biết trước DB thật có customer nào đang dùng giá trị này hay không) -
 *     nếu về sau xác nhận không còn customer nào dùng, có thể xoá tay qua
 *     API DELETE (bị chặn vì is_system, cần đổi is_system=false trước) hoặc
 *     viết migration dọn riêng.
 *   - Toàn bộ INSERT dùng `ON DUPLICATE KEY UPDATE` theo khoá unique `code`,
 *     và bước seed được đưa RA NGOÀI khối `if (!hasTable)` - an toàn khi
 *     chạy lại (vd môi trường đã từng migrate bảng rỗng, hoặc sau khi sửa
 *     file này trước khi merge) mà KHÔNG tạo trùng dòng hay ghi đè nhầm
 *     `is_system`/`id` của dòng đã tồn tại.
 *
 * ⚠️ PHẠM VI MIGRATION NÀY CHỈ LÀ NỀN TẢNG DB + PERMISSION. `customer.entity.ts`
 * (cột `status` vẫn khai `type: 'enum'` ở phía TypeScript), `CreateCustomerDto`/
 * `UpdateCustomerDto` (`@IsEnum([...])` đang chặn cứng 5 giá trị cũ),
 * `customers.import.service.ts`, và FE (`renderStatusTag` code cứng) - đều
 * CHƯA được sửa ở migration/module này, cần 1 lượt riêng để "link" các
 * thành phần đó đọc động từ `customer_statuses`.
 */
export class CreateCustomerStatuses1781400000000 implements MigrationInterface {
  name = 'CreateCustomerStatuses1781400000000';

  // 8 trạng thái mới theo yêu cầu (thay thế bộ cũ) - `code` được TÁI SỬ DỤNG
  // từ 4 trạng thái cũ tương đương ý nghĩa (xem giải thích ở JSDoc phía
  // trên) để không cần đụng tới dữ liệu `customers.status` hiện có.
  private readonly seedStatuses: {
    code: string;
    name: string;
    description: string | null;
    color: string;
    sortOrder: number;
  }[] = [
    { code: 'pending', name: 'Chờ xử lý', description: 'Trạng thái mặc định khi vừa nhập khách', color: '#faad14', sortOrder: 1 },
    { code: 'account_opened', name: 'Đã mở Tài khoản', description: null, color: '#13c2c2', sortOrder: 2 },
    { code: 'closed', name: 'Đã chốt', description: null, color: '#52c41a', sortOrder: 3 },
    { code: 'potential', name: 'Deal Tiềm Năng', description: null, color: '#1890ff', sortOrder: 4 },
    { code: 'callback_later', name: 'Liên hệ lại sau', description: null, color: '#722ed1', sortOrder: 5 },
    { code: 'lost', name: 'Deadlead', description: null, color: '#f5222d', sortOrder: 6 },
    { code: 'nurturing_group', name: 'Đang chăm sóc nhóm', description: null, color: '#eb2f96', sortOrder: 7 },
    { code: 'ib', name: 'IB', description: null, color: '#fa8c16', sortOrder: 8 },
    // Legacy - GIỮ NGUYÊN để tránh mồ côi dữ liệu, xem giải thích JSDoc trên.
    { code: 'inactive', name: 'Ngừng chăm sóc', description: null, color: '#8c8c8c', sortOrder: 99 },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('customer_statuses');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`customer_statuses\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`code\` varchar(50) NOT NULL,
          \`name\` varchar(100) NOT NULL,
          \`description\` varchar(255) NULL,
          \`is_system\` tinyint NOT NULL DEFAULT 0,
          \`color\` varchar(20) NOT NULL DEFAULT '#1890ff',
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_customer_statuses_code\` (\`code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Seed/upsert LUÔN chạy (không bọc trong `if (!hasTable)`) - idempotent
    // qua ON DUPLICATE KEY UPDATE theo `code`, an toàn dù bảng mới tạo hay
    // đã tồn tại sẵn (vd chạy lại migration này sau khi sửa file, hoặc 10
    // tài khoản migrate song song). `is_system` CHỈ set khi INSERT mới (dòng
    // đã tồn tại giữ nguyên is_system hiện có, không bị ghi đè ngược lại
    // false nếu admin đã lỡ đổi tay).
    for (const s of this.seedStatuses) {
      await queryRunner.query(
        `INSERT INTO \`customer_statuses\` (\`code\`, \`name\`, \`description\`, \`is_system\`, \`color\`, \`sort_order\`)
         VALUES (?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           \`name\` = VALUES(\`name\`),
           \`description\` = VALUES(\`description\`),
           \`color\` = VALUES(\`color\`),
           \`sort_order\` = VALUES(\`sort_order\`);`,
        [s.code, s.name, s.description, s.color, s.sortOrder],
      );
    }

    // Đổi cột status từ ENUM cứng -> VARCHAR tự do (giữ NOT NULL + default
    // 'pending' như cột gốc - 'pending' vẫn là code của "Chờ xử lý", đúng
    // đúng vai trò mặc định được yêu cầu). Lệnh MODIFY này tự idempotent -
    // chạy lại nhiều lần không lỗi vì MySQL cho phép MODIFY về cùng 1 type.
    await queryRunner.query(`
      ALTER TABLE \`customers\`
      MODIFY COLUMN \`status\` varchar(50) NOT NULL DEFAULT 'pending';
    `);

    // Seed permission CRUD cho module mới, mirror đúng bộ 3 quyền
    // view/manage/delete của media_sources/positions.
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customer_statuses.view', 'customer_statuses', 'view', FALSE, 'Xem danh sách Trạng thái khách hàng'),
      ('customer_statuses.manage', 'customer_statuses', 'manage', FALSE, 'Tạo/sửa Trạng thái khách hàng'),
      ('customer_statuses.delete', 'customer_statuses', 'delete', FALSE, 'Xoá Trạng thái khách hàng - chỉ Admin')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Xem được (dropdown chọn trạng thái khi thêm/sửa khách hàng): mọi role
    // đã đăng nhập cần dùng được, mirror đúng media_sources.view.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager', 'employee')
        AND p.key = 'customer_statuses.view';
    `);

    // Tạo/sửa: Admin + Assistant (mirror media_sources.manage).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.key = 'customer_statuses.manage';
    `);

    // Xoá: chỉ Admin (mirror media_sources.delete).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.key = 'customer_statuses.delete';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key IN ('customer_statuses.view', 'customer_statuses.manage', 'customer_statuses.delete');
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'customer_statuses.view', 'customer_statuses.manage', 'customer_statuses.delete'
      );
    `);

    // Trả lại ENUM cũ - CHỈ an toàn nếu chưa có customer nào dùng status
    // ngoài 5 giá trị gốc (giống lý luận downgrade ở CreateMediaSources).
    // ⚠️ Sau migration này, `potential`/`lost` chỉ đổi TÊN HIỂN THỊ, `code`
    // gốc không đổi - nên rollback ENUM này vẫn khớp dữ liệu, KHÔNG cần xử
    // lý gì thêm cho 4 code mới (account_opened/callback_later/
    // nurturing_group/ib) - miễn là chưa có customer nào được gán 1 trong 4
    // status mới đó (nếu có, lệnh MODIFY bên dưới sẽ lỗi "Data truncated",
    // đúng bản chất downgrade từ tự do về đóng cứng).
    await queryRunner.query(`
      ALTER TABLE \`customers\`
      MODIFY COLUMN \`status\` enum('closed','pending','potential','lost','inactive') NOT NULL DEFAULT 'pending';
    `);

    const hasTable = await queryRunner.hasTable('customer_statuses');
    if (hasTable) {
      await queryRunner.query(`DROP TABLE \`customer_statuses\`;`);
    }
  }
}
