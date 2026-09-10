import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung sau `1781100000000-CreateAssignmentGroupConfigs.ts` - theo yêu cầu
 * trực tiếp của chủ dự án (2026-09-10): dropdown "Quản lý chính" và "Quản lý
 * phụ" ở trang `/nhom-lien-ket` KHÔNG dùng chung config `marketing` (đã dùng
 * cho "Marketing phụ trách" ở form Khách hàng) - sửa config `marketing` qua
 * `/quan-ly-phu-trach` sẽ ảnh hưởng đồng thời tới cả 2 nơi không liên quan
 * nghiệp vụ với nhau. Tách thành 2 key RIÊNG, độc lập hoàn toàn, để sau này
 * có thể chỉnh sửa mỗi cái một khác mà không đụng nhau:
 *   - `link_group_primary_manager` ("Quản lý chính - Nhóm liên kết")
 *   - `link_group_secondary_manager` ("Quản lý phụ - Nhóm liên kết")
 *
 * Cả 2 seed CÙNG giá trị mặc định ban đầu (Phòng Marketing, không lọc theo
 * Vị trí - giữ đúng hành vi "Quản lý chính" đang chạy, và áp luôn filter này
 * cho "Quản lý phụ" theo xác nhận của chủ dự án - trước đây "Quản lý phụ"
 * KHÔNG lọc gì, cho phép gán bất kỳ ai) - nhưng là 2 HÀNG riêng biệt trong
 * bảng `assignment_group_configs`, Admin sửa cái này ở `/quan-ly-phu-trach`
 * không ảnh hưởng cái kia.
 *
 * ⚠️ CHƯA gán sẵn `primary_manager_id`/`secondary manager` THẬT cho bất kỳ
 * `link_groups` nào đang có trong DB - đây CHỈ là migration thêm config LỌC
 * (departments/positions hợp lệ cho dropdown), không phải seed data gán
 * quản lý cho từng nhóm cụ thể (đúng xác nhận "chỉ thêm config key mới,
 * chưa gán sẵn data cho nhóm nào" của chủ dự án).
 *
 * `is_system = TRUE` (giống 3 config gốc `sales`/`marketing`/`content_staff`)
 * để chặn Admin xoá nhầm qua UI (`AssignmentGroupsService.remove()` throw
 * nếu `is_system=true`) - 2 dropdown ở `/nhom-lien-ket` phụ thuộc trực tiếp
 * vào 2 key này, xoá đi sẽ làm dropdown luôn trả rỗng (`resolveUsers()` trả
 * `[]` khi không tìm thấy phòng ban nào, xem `assignment-groups.service.ts`).
 *
 * Không cần permission mới - dùng chung 4 permission
 * `assignment_groups.view/create/update/delete` đã seed ở migration
 * `1781100000000` (permission áp dụng theo ROW, không phải theo KEY cụ thể).
 * Không cần sửa Controller/Service - `resolveUsers(key)` đã generic theo key.
 */
export class AddLinkGroupManagerAssignmentConfigs1781200000000 implements MigrationInterface {
  name = 'AddLinkGroupManagerAssignmentConfigs1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO assignment_group_configs (\`key\`, name, description, is_system) VALUES
      ('link_group_primary_manager', 'Quản lý chính - Nhóm liên kết', 'Danh sách nhân sự hợp lệ cho dropdown "Quản lý chính" ở trang Quản lý nhóm liên kết', TRUE),
      ('link_group_secondary_manager', 'Quản lý phụ - Nhóm liên kết', 'Danh sách nhân sự hợp lệ cho dropdown "Quản lý phụ" ở trang Quản lý nhóm liên kết', TRUE)
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Mặc định ban đầu = Phòng Marketing (auto map theo TÊN, không hardcode
    // department_id vì id khác nhau giữa các môi trường dùng chung migration
    // này - đúng pattern migration 1781100000000). Không seed Vị trí nào ->
    // không lọc theo Vị trí, giống hàng "marketing" cũ.
    await queryRunner.query(`
      INSERT IGNORE INTO assignment_group_config_departments (config_id, department_id)
      SELECT c.id, d.id
      FROM assignment_group_configs c
      JOIN departments d ON LOWER(d.name) LIKE '%marketing%'
      WHERE c.key = 'link_group_primary_manager';
    `);
    await queryRunner.query(`
      INSERT IGNORE INTO assignment_group_config_departments (config_id, department_id)
      SELECT c.id, d.id
      FROM assignment_group_configs c
      JOIN departments d ON LOWER(d.name) LIKE '%marketing%'
      WHERE c.key = 'link_group_secondary_manager';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM assignment_group_configs
      WHERE \`key\` IN ('link_group_primary_manager', 'link_group_secondary_manager');
    `);
  }
}
