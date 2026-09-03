import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xoá cột `users.profile` (JSON thủ công lưu URL Fanpage/Group) - đã được
 * thay thế hoàn toàn bằng dữ liệu TÍNH TOÁN ĐỘNG từ:
 *   - `link_groups.primary_manager_id` (Quản lý chính)
 *   - `link_group_secondary_managers` (Quản lý phụ)
 * (2 bảng này đã tồn tại từ trước - xem migration
 * 1777800000000-CreateLinkGroupsSystem.ts và
 * 1777900000000-AddLinkGroupManagers.ts - không cần tạo thêm gì mới, chỉ
 * đơn giản là XOÁ cột dữ liệu trùng lặp/thủ công này).
 *
 * Lý do: `users.profile` yêu cầu Admin tự tay gõ lại từng URL cho từng
 * user - trùng lặp hoàn toàn với việc gán "Quản lý chính/phụ" đã làm ở
 * link_groups. Từ nay trang Profile tự động hiển thị đúng nhóm mà user
 * đang được gán chính/phụ, không cần nhập tay thêm ở đâu nữa.
 *
 * An toàn dữ liệu: cột này CHƯA được dùng để lưu dữ liệu quan trọng lâu dài
 * (chỉ là danh sách URL hiển thị) - không cần bước migrate dữ liệu cũ sang
 * link_groups (dữ liệu cũ, nếu có, được coi là test data / để rà soát thủ
 * công lại bằng tính năng "Quản lý nhóm liên kết" nếu cần khôi phục).
 */
export class DropUserProfileColumn1778100000000 implements MigrationInterface {
  name = 'DropUserProfileColumn1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'profile');
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\` DROP COLUMN \`profile\`;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'profile');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD COLUMN \`profile\` json NULL
        COMMENT 'Danh sách link Fanpage/Group user quản lý - [{type,name,url}]. Only Admin CRUD.'
        AFTER \`department_id\`;
      `);
    }
  }
}
