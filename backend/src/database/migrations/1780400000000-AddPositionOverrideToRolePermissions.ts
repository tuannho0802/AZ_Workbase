import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2/4 của PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md - thêm
 * cột override TẦNG VỊ TRÍ (Position) vào ĐÚNG bảng `role_permissions` đã có
 * (KHÔNG tạo bảng song song) để tái dùng 100% logic merge/cache/invalidate
 * đã có trong `PermissionsService` - chỉ mở rộng thêm 1 cột.
 *
 * ⚠️ Ràng buộc nghiệp vụ "1 dòng CHỈ được set department_id HOẶC position_id,
 * KHÔNG cả hai" được enforce ở SERVICE LAYER (`RolesService`), KHÔNG bằng DB
 * CHECK constraint - giữ đúng lý do đã ghi trong
 * `AddDenyScopeForDepartmentOverrides.ts` (tránh phụ thuộc tính năng CHECK
 * không đồng nhất giữa các phiên bản MySQL).
 *
 * Thứ tự ưu tiên override: Position -> Department -> Global (xem PLAN mục
 * 2.2, đã hiện thực ở `PermissionsService.loadRolePermissionMap()`).
 */
export class AddPositionOverrideToRolePermissions1780400000000
  implements MigrationInterface
{
  name = 'AddPositionOverrideToRolePermissions1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS position_id INT NULL;
    `);

    const [{ cnt }] = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'role_permissions'
        AND CONSTRAINT_NAME = 'fk_role_permissions_position'
    `);
    if (Number(cnt) === 0) {
      await queryRunner.query(`
        ALTER TABLE role_permissions
          ADD CONSTRAINT fk_role_permissions_position FOREIGN KEY (position_id)
            REFERENCES positions(id) ON DELETE CASCADE;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ cnt }] = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'role_permissions'
        AND CONSTRAINT_NAME = 'fk_role_permissions_position'
    `);
    if (Number(cnt) > 0) {
      await queryRunner.query(`ALTER TABLE role_permissions DROP FOREIGN KEY fk_role_permissions_position`);
    }
    await queryRunner.query(`ALTER TABLE role_permissions DROP COLUMN IF EXISTS position_id`);
  }
}
