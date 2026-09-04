import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NỀN TẢNG "Phân quyền tuỳ chỉnh" (Custom RBAC) - cho phép Admin tự
 * thêm/sửa/xoá Role và tuỳ chỉnh ma trận quyền (resource + action + phạm vi)
 * qua UI, KHÔNG cần deploy code mỗi khi đổi yêu cầu nghiệp vụ.
 *
 * ⚠️ THIẾT KẾ QUAN TRỌNG - AN TOÀN NGƯỢC (backward-compatible), KHÔNG PHÁ VỠ
 * CODE CŨ: 4 role hệ thống hiện tại (admin/manager/assistant/employee) vẫn
 * giữ NGUYÊN chuỗi giá trị y hệt trong cột `users.role` - toàn bộ code cũ
 * dùng `@Roles(Role.ADMIN)`/`user.role === 'admin'` (rải rác ở ~15 module)
 * TIẾP TỤC CHẠY ĐÚNG, không cần sửa gì. Role MỚI (do Admin tự tạo qua UI,
 * vd "mkt_manager") chỉ cần thêm 1 dòng vào bảng `roles` - không đụng tới
 * bất kỳ code TypeScript nào. Các endpoint MỚI (hoặc được migrate dần sau
 * này) sẽ đọc quyền từ `role_permissions` thay vì so sánh chuỗi cứng.
 *
 * 4 bước:
 * 1. Tạo bảng roles/permissions/role_permissions.
 * 2. Seed 4 role hệ thống (is_system=true - không xoá được, code cố định).
 * 3. Seed danh mục permission ban đầu (đúng những action đã có trong hệ
 *    thống hôm nay - PERMISSIONS.md) - permission là "cái code THẬT SỰ có
 *    kiểm tra", KHÔNG phải Admin tự đặt tên tuỳ ý, tránh tạo ra quyền không
 *    ai enforce.
 * 4. Đổi `users.role` từ ENUM cứng -> VARCHAR(50) + FOREIGN KEY tới
 *    `roles.code` - để có thể gán role MỚI (ngoài 4 giá trị cũ) cho user,
 *    đồng thời vẫn đảm bảo toàn vẹn dữ liệu (không gán được role không tồn
 *    tại trong bảng roles).
 */
export class AddCustomRbacSystem1778400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1) Bảng roles
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE roles (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(50) NOT NULL COMMENT 'Định danh nội bộ, bất biến sau khi tạo - dùng làm giá trị lưu trong users.role (vd "mkt_manager")',
        name VARCHAR(100) NOT NULL COMMENT 'Tên hiển thị trên UI, Admin sửa được (vd "Trưởng phòng Marketing")',
        description VARCHAR(255) NULL,
        is_system BOOLEAN NOT NULL DEFAULT FALSE COMMENT '4 role gốc (admin/manager/assistant/employee) - không xoá được, code bất biến',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_roles_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ------------------------------------------------------------------
    // 2) Bảng permissions - danh mục các quyền THẬT SỰ được code kiểm tra.
    //    Admin KHÔNG tự thêm dòng mới vào bảng này qua UI (khác với roles) -
    //    bảng này chỉ được mở rộng khi dev thêm 1 tính năng mới có enforce
    //    quyền tương ứng trong code, kèm migration seed thêm dòng.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE permissions (
        id INT NOT NULL AUTO_INCREMENT,
        \`key\` VARCHAR(100) NOT NULL COMMENT 'Định danh duy nhất, dạng "resource.action" (vd "customers.assign")',
        resource VARCHAR(50) NOT NULL COMMENT 'Nhóm chức năng (vd "customers", "leave_requests") - dùng để gom nhóm hiển thị UI',
        action VARCHAR(50) NOT NULL COMMENT 'Hành động (vd "view", "assign", "approve")',
        supports_scope BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Quyền này có khái niệm phạm vi (own/department/all) không - 1 số quyền nhị phân thuần (vd "roles.manage") không cần',
        description VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_permissions_key (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ------------------------------------------------------------------
    // 3) Bảng role_permissions - MA TRẬN THẬT SỰ Admin chỉnh qua UI.
    //    `scope`: NULL nếu permission.supports_scope=false (quyền nhị phân);
    //    'own'|'department'|'all' nếu có - quyết định service filter dữ liệu
    //    tới đâu (tái dùng đúng pattern applyViewFilter() đã có, chỉ đổi từ
    //    if/else cứng theo Role enum sang tra bảng này).
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE role_permissions (
        id INT NOT NULL AUTO_INCREMENT,
        role_id INT NOT NULL,
        permission_id INT NOT NULL,
        scope ENUM('own', 'department', 'all') NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_role_permission (role_id, permission_id),
        CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ------------------------------------------------------------------
    // 4) Seed 4 role hệ thống - code TRÙNG KHỚP TUYỆT ĐỐI giá trị enum cũ,
    //    để users.role hiện có (đang là 'admin'/'manager'/...) tiếp tục hợp
    //    lệ ngay sau khi đổi FK bên dưới, không cần UPDATE dữ liệu user nào.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO roles (code, name, description, is_system) VALUES
      ('admin', 'Admin', 'Toàn quyền hệ thống - không giới hạn', TRUE),
      ('manager', 'Manager', 'Quản lý - phạm vi theo phòng ban quản lý', TRUE),
      ('assistant', 'Assistant', 'Trợ lý - xem/thao tác hầu hết module, không quản lý phân quyền', TRUE),
      ('employee', 'Employee', 'Nhân viên - phạm vi cá nhân', TRUE);
    `);

    // ------------------------------------------------------------------
    // 5) Seed danh mục permission ban đầu, khớp đúng các action đã thật sự
    //    được enforce trong code hiện tại (đối chiếu PERMISSIONS.md) + vài
    //    permission mới phục vụ đúng ví dụ nghiệp vụ ban đầu (MKT/Sales
    //    Leader) - CHƯA gán cho role nào ở bước này, chỉ tạo danh mục.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customers.view', 'customers', 'view', TRUE, 'Xem danh sách/chi tiết khách hàng'),
      ('customers.assign', 'customers', 'assign', TRUE, 'Chia data khách hàng cho Sales'),
      ('customers.note', 'customers', 'note', TRUE, 'Ghi chú/chăm sóc khách hàng'),
      ('customers.delete', 'customers', 'delete', FALSE, 'Xoá khách hàng (luôn toàn cục, không có khái niệm phạm vi)'),
      ('leave_requests.request', 'leave_requests', 'request', FALSE, 'Tạo đơn xin nghỉ phép cho bản thân'),
      ('leave_requests.approve', 'leave_requests', 'approve', TRUE, 'Duyệt/từ chối đơn nghỉ phép'),
      ('attendance.view', 'attendance', 'view', TRUE, 'Xem bảng chấm công'),
      ('attendance.manage', 'attendance', 'manage', TRUE, 'Đồng bộ/map/dọn dẹp dữ liệu chấm công'),
      ('reports.view', 'reports', 'view', TRUE, 'Xem báo cáo doanh số/KPI'),
      ('users.manage', 'users', 'manage', TRUE, 'Thêm/sửa/duyệt nhân viên'),
      ('roles.view', 'roles', 'view', FALSE, 'Xem danh sách Role và ma trận phân quyền'),
      ('roles.manage', 'roles', 'manage', FALSE, 'Thêm/sửa/xoá Role và chỉnh ma trận phân quyền - CHỈ Admin');
    `);

    // ------------------------------------------------------------------
    // 6) Gán quyền cho 4 role hệ thống - PHẢN ÁNH ĐÚNG hành vi code hiện tại
    //    (không đổi behavior nào, chỉ "ghi lại" luật đã áp dụng bằng code
    //    thành dữ liệu, để UI phân quyền hiển thị đúng ngay từ đầu).
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id,
        CASE
          WHEN r.code = 'admin' THEN 'all'
          WHEN r.code = 'manager' THEN 'department'
          WHEN r.code = 'assistant' THEN 'all'
          WHEN r.code = 'employee' THEN 'own'
        END
      FROM roles r
      CROSS JOIN permissions p
      WHERE p.supports_scope = TRUE
        AND p.key IN ('customers.view', 'customers.assign', 'customers.note', 'attendance.view', 'reports.view', 'leave_requests.approve')
        AND NOT (r.code = 'employee' AND p.key IN ('customers.assign', 'attendance.view', 'reports.view', 'leave_requests.approve'));
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r CROSS JOIN permissions p
      WHERE p.key = 'leave_requests.request';
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.key = 'customers.delete';
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'department' FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager') AND p.key = 'attendance.manage';
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'department' FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager') AND p.key = 'users.manage';
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.key = 'roles.manage';
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.key = 'roles.view';
    `);

    // ------------------------------------------------------------------
    // 7) Đổi users.role từ ENUM cứng -> VARCHAR + FOREIGN KEY tới roles.code.
    //    Đây là bước GIẢI PHÓNG - từ giờ gán role mới cho user không cần
    //    ALTER TABLE nữa, chỉ cần INSERT 1 dòng vào bảng roles.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'employee';
    `);
    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT FK_users_role FOREIGN KEY (role) REFERENCES roles(code)
      ON UPDATE CASCADE ON DELETE RESTRICT;
    `);
    // ON UPDATE CASCADE: nếu sau này đổi code của 1 role (hiếm, roles.code
    // vốn được thiết kế bất biến sau khi tạo - xem RolesService), giá trị
    // users.role tự cập nhật theo, không mồ côi dữ liệu.
    // ON DELETE RESTRICT: KHÔNG cho xoá role đang có user gán - chặn ở tầng
    // DB, không chỉ ở service (an toàn kể cả khi có bug ở tầng code).
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP FOREIGN KEY FK_users_role`);
    await queryRunner.query(`
      ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'manager', 'assistant', 'employee') NOT NULL DEFAULT 'employee';
    `);
    await queryRunner.query(`DROP TABLE role_permissions`);
    await queryRunner.query(`DROP TABLE permissions`);
    await queryRunner.query(`DROP TABLE roles`);
  }
}
