import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3/4 của PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md - thêm
 * trục phân quyền THỨ HAI, ĐỘC LẬP với Action Permission (`role_permissions`):
 * "Role/Phòng ban/Vị trí này có được THẤY field/tab X không?" (khác câu hỏi
 * "có được LÀM hành động X không" mà `role_permissions` đang trả lời).
 *
 * ⚠️ QUAN TRỌNG NHẤT - ĐỌC KỸ TRƯỚC KHI SỬA BẤT KỲ GÌ LIÊN QUAN BẢNG NÀY:
 * bảng này mặc định là "opt-out" - KHÔNG có dòng nào cho 1 role/field nghĩa
 * là field/tab đó ĐANG HIỆN (allow), NGƯỢC HẲN với `role_permissions` (không
 * có dòng = KHÔNG có quyền/deny). Đây là CHỦ Ý (xem PLAN mục 2.1), không phải
 * bug - nếu 1 Agent sau này đổi default resolve thành "deny khi trống" thì
 * TOÀN BỘ field/tab của MỌI Role sẽ biến mất ngay khi bảng này còn trống
 * (trường hợp thật ngay sau khi chạy migration này) - đây là lỗi nghiêm
 * trọng, không được để xảy ra. Không seed dòng nào mặc định - đúng ý định.
 *
 * Thứ tự ưu tiên override TUYẾN TÍNH 3 TẦNG - GIỐNG HỆT `role_permissions`
 * (Position -> Department -> Global, xem `UiVisibilityService.loadHiddenKeysMap()`
 * và PLAN mục 2.2/3.4): 1 dòng CHỈ được set `department_id` HOẶC
 * `position_id`, không cả hai (validate ở service layer, KHÔNG dùng DB CHECK
 * - cùng lý do đã ghi trong AddDenyScopeForDepartmentOverrides.ts).
 *
 * `resource`/`element_key` là danh mục CỐ ĐỊNH trong code
 * (`ui-visibility.constants.ts`), Admin chỉ được BẬT/TẮT qua UI, không tự
 * thêm key tuỳ ý - đúng triết lý bảng `permissions` gốc.
 */
export class CreateUiVisibilityRules1780700000000 implements MigrationInterface {
  name = 'CreateUiVisibilityRules1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ui_visibility_rules (
        id INT PRIMARY KEY AUTO_INCREMENT,
        role_id INT NOT NULL,
        department_id INT NULL,
        position_id INT NULL,
        resource VARCHAR(50) NOT NULL,
        element_key VARCHAR(100) NOT NULL,
        visible BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_ui_visibility_rule (role_id, resource, element_key, department_id, position_id),
        CONSTRAINT fk_ui_visibility_role FOREIGN KEY (role_id)
          REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT fk_ui_visibility_department FOREIGN KEY (department_id)
          REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_ui_visibility_position FOREIGN KEY (position_id)
          REFERENCES positions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ⚠️ KHÔNG dùng NULL trong UNIQUE KEY để chặn trùng "global" (MySQL coi
    // 2 dòng NULL trong UNIQUE KEY là KHÁC nhau, không xung đột) - đây là
    // hành vi CHUẨN của MySQL cho unique index có cột nullable, không phải
    // thiếu sót. Ràng buộc "không tạo 2 dòng global trùng element_key" được
    // validate ở service layer (`UiVisibilityService`) bằng cách tự query
    // trước khi insert, giống cách `role_permissions` xử lý tương tự.

    // KHÔNG seed bất kỳ dòng nào - đúng thiết kế "opt-out", xem JSDoc đầu file.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ui_visibility_rules`);
  }
}
