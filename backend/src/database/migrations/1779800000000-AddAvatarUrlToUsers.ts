import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Theo `AZ-Workbase Skills/PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md` mục
 * 0/1: thêm avatar tự-upload cho user qua Backblaze B2 (bucket PRIVATE).
 *
 * ⚠️ QUAN TRỌNG: `avatar_url` KHÔNG lưu URL trực tiếp - lưu OBJECT KEY (vd
 * `avatars/12/a1b2c3.webp`) giống hệt bản chất `leave_requests.attachment_url`
 * hiện có. Vì cả 2 bucket B2 đều Private (không bật Public được nếu không
 * gắn thẻ - xem plan mục 0), mọi endpoint trả `User` cho FE phải tự ký lại
 * thành Presigned GET URL trước khi trả về (xem `UsersService.signAvatarUrl()`).
 *
 * Permission mới `profile.edit_avatar` nhân bản đúng pattern
 * `profile.edit_info`/`profile.change_password` (migration
 * `1779700000000-AddUserSoftDeleteAndProfilePermissions`): supports_scope=TRUE,
 * mặc định scope='own' cho CẢ 4 role - vì endpoint `PATCH /users/me/avatar`
 * chỉ tác động lên CHÍNH user gọi (id lấy từ JWT).
 */
export class AddAvatarUrlToUsers1779800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN avatar_url VARCHAR(255) NULL
      COMMENT 'Object key trên Backblaze B2 (bucket avatars) - KHÔNG phải URL trực tiếp, phải ký lại Presigned GET trước khi trả FE';
    `);

    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('profile.edit_avatar', 'profile', 'edit_avatar', TRUE, 'Tự upload/đổi ảnh đại diện của chính mình')
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'own'
      FROM roles r, permissions p
      WHERE p.key = 'profile.edit_avatar'
        AND r.code IN ('admin', 'assistant', 'manager', 'employee');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` = 'profile.edit_avatar'
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN avatar_url;
    `);
  }
}
