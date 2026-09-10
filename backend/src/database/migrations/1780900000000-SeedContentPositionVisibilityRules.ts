import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-seed migration (KHÔNG đổi schema, bảng `ui_visibility_rules` đã tạo ở
 * `1780700000000-CreateUiVisibilityRules.ts`) - nạp sẵn 1 bộ rule MẪU đúng
 * ví dụ cụ thể đã thống nhất: Role `employee` + Position `content` (phòng
 * Marketing) KHÔNG được thấy "Sales phụ trách", "Marketing phụ trách",
 * "Ngày nhận KH" (assigned_date), "Ngày chốt KH" (closed_date) - cả ở CỘT
 * bảng danh sách lẫn Ở CHI TIẾT khách hàng - và chỉ còn 2 tab "Ghi chú"/
 * "Chi tiết" (ẩn tab Nạp tiền/Lịch sử phân công/Nhóm liên kết).
 *
 * ⚠️ Đây CHỈ là 1 bộ rule MẪU cho 1 Position cụ thể (`content`) - KHÔNG áp
 * dụng đại trà cho `editor`/`media` hay Position nào khác. Admin tự bật/tắt
 * thêm cho các Position khác qua UI (`PUT /roles/:id/ui-visibility-rules`
 * với `positionId` tương ứng, xem tab "Hiển thị dữ liệu" ở `/phan-quyen`)
 * đúng đúng tinh thần "tuỳ chọn hiển thị cho TỪNG Position khác nhau", không
 * hardcode cứng logic ẩn theo Position trong code.
 *
 * PHỤ THUỘC 2 migration seed data trước đó, chạy SAU cả hai:
 *  - `1780800000000-SeedSamplePositions.ts` (cần Position `content` tồn tại)
 *  - Role `employee` LUÔN tồn tại (1 trong 4 role hệ thống gốc, seed từ lúc
 *    khởi tạo dự án - không phụ thuộc migration seed nào khác).
 * Nếu môi trường nào ĐÃ lỡ xoá Position `content` (Admin tự xoá qua UI sau
 * khi seed) - migration này tự bỏ qua (không insert được gì, KHÔNG lỗi, xem
 * `WHERE EXISTS` bên dưới), tuyệt đối KHÔNG tự tạo lại Position đã bị xoá.
 *
 * ⚠️ KHÔNG dùng `ON DUPLICATE KEY UPDATE` để idempotent (khác pattern hay
 * dùng ở các migration khác) - vì `department_id` của các dòng này là NULL,
 * và MySQL coi 2 dòng NULL trong UNIQUE KEY là KHÁC nhau (đã ghi rõ trong
 * JSDoc `CreateUiVisibilityRules1780700000000`) - dùng lại đúng pattern
 * `INSERT ... SELECT ... WHERE NOT EXISTS` đã áp dụng ở
 * `SeedSamplePositions1780800000000` để chạy lại an toàn, không tạo trùng.
 */
export class SeedContentPositionVisibilityRules1780900000000 implements MigrationInterface {
  name = 'SeedContentPositionVisibilityRules1780900000000';

  // Đúng danh mục `CUSTOMER_ELEMENT_KEYS` trong `ui-visibility.constants.ts`
  // TRỪ 'tab:groups' đã bàn nhưng ví dụ gốc chỉ nói rõ 2 tab còn lại là
  // "Ghi chú" và "Chi tiết" -> ẩn LUÔN 'tab:groups' để khớp đúng "content
  // chỉ có 2 tab này" (Ghi chú + Chi tiết, không có Nạp tiền/Phân công/Nhóm).
  private readonly hiddenElementKeys = [
    'field:sales_assignment',
    'field:marketing_assignment',
    'field:assigned_date',
    'field:closed_date',
    'tab:deposits',
    'tab:assignments',
    'tab:groups',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of this.hiddenElementKeys) {
      await queryRunner.query(
        `
        INSERT INTO ui_visibility_rules (role_id, department_id, position_id, resource, element_key, visible)
        SELECT r.id, NULL, p.id, 'customers', ?, FALSE
        FROM roles r, positions p
        WHERE r.code = 'employee' AND p.code = 'content'
          AND NOT EXISTS (
            SELECT 1 FROM ui_visibility_rules x
            WHERE x.role_id = r.id AND x.position_id = p.id
              AND x.resource = 'customers' AND x.element_key = ?
          );
      `,
        [key, key],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ xoá ĐÚNG các dòng seed của migration này (role employee + position
    // content + 7 element_key liệt kê ở trên) - KHÔNG đụng override nào khác
    // Admin đã tự cấu hình thêm cho Position/Role khác sau đó.
    await queryRunner.query(
      `
      DELETE x FROM ui_visibility_rules x
      JOIN roles r ON r.id = x.role_id
      JOIN positions p ON p.id = x.position_id
      WHERE r.code = 'employee' AND p.code = 'content'
        AND x.resource = 'customers'
        AND x.element_key IN (${this.hiddenElementKeys.map(() => '?').join(', ')});
    `,
      this.hiddenElementKeys,
    );
  }
}
