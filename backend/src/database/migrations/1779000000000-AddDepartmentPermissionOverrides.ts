import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột `department_id` (nullable) vào `role_permissions` - cho phép 1
 * role có permission KHÁC NHAU tuỳ theo phòng ban của user, thay vì áp
 * dụng như nhau cho MỌI người có role đó:
 *
 *  - `department_id IS NULL`  -> dòng áp dụng cho MỌI phòng ban (hành vi
 *    CŨ - toàn bộ dữ liệu hiện có giữ nguyên nghĩa, không cần migrate dữ
 *    liệu, chỉ thêm cột).
 *  - `department_id = X`      -> dòng CHỈ áp dụng cho user có role này VÀ
 *    đang thuộc phòng ban X - OVERRIDE dòng NULL cùng
 *    (role_id, permission_id), nếu có, chỉ cho riêng phòng ban đó.
 *
 * Ví dụ: role `employee` + permission `customers.assign` + KHÔNG có dòng
 * nào -> Employee không có quyền chia data theo mặc định. Thêm 1 dòng
 * (employee, customers.assign, department_id=<MKT>, scope=department) ->
 * CHỈ nhân viên phòng MKT có quyền chia data, phòng khác vẫn không có,
 * không cần tạo role mới.
 *
 * ⚠️ FIX BUG QUAN TRỌNG so với thiết kế ban đầu: bảng `role_permissions`
 * (tạo ở migration gốc `AddCustomRbacSystem`, 1778400000000) đã có sẵn
 * `UNIQUE KEY UQ_role_permission (role_id, permission_id)` - unique KHÔNG
 * tính tới `department_id`. Nếu chỉ thêm cột mà không sửa lại unique key
 * này, MỌI lần insert 1 dòng override (department_id khác NULL) cho 1 cặp
 * (role_id, permission_id) ĐÃ có sẵn dòng global (department_id=NULL) sẽ
 * bị MySQL từ chối ngay (trùng khoá) - tính năng override sẽ không dùng
 * được với bất kỳ permission nào đã có dòng global từ trước (tức hầu hết
 * mọi permission đang dùng hiện tại). Migration này DROP unique key cũ,
 * thay bằng unique key 3 cột (role_id, permission_id, department_id).
 *
 * ⚠️ LƯU Ý CÒN LẠI CHO TẦNG ỨNG DỤNG (không xử lý được ở DB, ghi rõ để
 * không quên): MySQL coi NHIỀU giá trị NULL trong 1 cột thuộc unique index
 * là "khác nhau" (không vi phạm unique) - unique key 3 cột KHÔNG chặn được
 * việc lỡ insert 2 dòng (role_id=5, permission_id=3, department_id=NULL)
 * trùng nhau. Tầng service (RolesService) khi ghi dòng "global" mới PHẢI
 * tự kiểm tra đã có dòng NULL nào cho (role_id, permission_id) chưa, dùng
 * UPDATE thay vì INSERT nếu có - không dựa vào DB tự chặn.
 */
export class AddDepartmentPermissionOverrides1779000000000
  implements MigrationInterface {
  name = 'AddDepartmentPermissionOverrides1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // FIX LỖI THẬT (đã gặp khi chạy trên MySQL thật - `ER_DROP_INDEX_FK`,
    // errno 1553): KHÔNG được tách `DROP INDEX UQ_role_permission` thành 1
    // câu `ALTER TABLE` riêng trước khi có index khác thay thế. InnoDB yêu
    // cầu FK `FK_role_permissions_role (role_id)` LUÔN phải có ít nhất 1
    // index còn tồn tại với `role_id` ở vị trí đầu (leading column) tại MỌI
    // THỜI ĐIỂM giữa các câu lệnh riêng lẻ - `UQ_role_permission
    // (role_id, permission_id)` chính là index duy nhất đang đỡ vai trò đó,
    // nên 1 câu `ALTER TABLE ... DROP INDEX` đứng riêng sẽ để lộ ra 1
    // khoảnh khắc FK không còn index đỡ -> MySQL từ chối ngay.
    //
    // Cách sửa CHUẨN của MySQL cho đúng tình huống này: gộp TOÀN BỘ
    // `ADD COLUMN` + `DROP INDEX` cũ + `ADD` index mới (vẫn có `role_id` ở
    // vị trí đầu) + `ADD CONSTRAINT` FK MỚI vào CHUNG 1 câu `ALTER TABLE`
    // duy nhất (nhiều clause, phân tách bằng dấu phẩy). MySQL/InnoDB chỉ
    // kiểm tra ĐIỀU KIỆN FK-cần-index dựa trên TRẠNG THÁI CUỐI CÙNG sau khi
    // áp dụng hết các clause trong CÙNG 1 câu lệnh, không kiểm tra từng
    // bước trung gian - nên gộp lại là an toàn, tách ra là lỗi.
    await queryRunner.query(`
      ALTER TABLE role_permissions
        ADD COLUMN department_id INT NULL AFTER permission_id,
        DROP INDEX UQ_role_permission,
        ADD UNIQUE KEY UQ_role_permission_department (role_id, permission_id, department_id),
        ADD CONSTRAINT FK_role_permissions_department
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cùng lý do ở up() - gộp chung 1 câu lệnh: xoá FK trước (để cột
    // department_id không còn bị ràng buộc), xoá unique key 3 cột, thêm lại
    // unique key 2 cột gốc (khôi phục index đỡ cho FK role_id), rồi mới xoá
    // cột department_id - tất cả trong 1 `ALTER TABLE`, không tách lẻ.
    await queryRunner.query(`
      ALTER TABLE role_permissions
        DROP FOREIGN KEY FK_role_permissions_department,
        DROP INDEX UQ_role_permission_department,
        ADD UNIQUE KEY UQ_role_permission (role_id, permission_id),
        DROP COLUMN department_id
    `);
  }
}