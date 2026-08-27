import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tạo hệ thống "Category -> Group -> Customer đã join" - KHÔNG liên quan tới
 * `media_sources` (kênh khách hàng, gắn với `customers.source`) dù giống
 * pattern UI (Tag màu, admin CRUD) - tách bảng riêng vì khác domain hoàn
 * toàn: đây là danh sách NHÓM NỘI BỘ (Zalo/FB/Threads Group...) mà khách
 * hàng được mời tham gia, không phải kênh marketing thu khách.
 *
 *   link_categories  - nền tảng (Zalo, Threads, Facebook, Instagram...)
 *   link_groups      - từng nhóm cụ thể thuộc 1 category, MỖI GROUP 1 URL
 *                       riêng (đã xác nhận với người dùng - khác nhau thật,
 *                       không dùng chung URL)
 *   customer_group_memberships - CUSTOMER nào đã join GROUP nào (boolean) -
 *                       đã xác nhận: tính theo KHÁCH HÀNG, không phải nhân
 *                       viên - khác hẳn với `users.profile` (JSON link nhân
 *                       viên tự quản lý, giữ nguyên riêng biệt, không đụng).
 */
export class CreateLinkGroupsSystem1777800000000 implements MigrationInterface {
  name = 'CreateLinkGroupsSystem1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCategories = await queryRunner.hasTable('link_categories');
    if (!hasCategories) {
      await queryRunner.query(`
        CREATE TABLE \`link_categories\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`name\` varchar(100) NOT NULL,
          \`color\` varchar(20) NOT NULL DEFAULT '#1677ff',
          \`is_locked\` tinyint NOT NULL DEFAULT 0,
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_link_categories_name\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Seed sẵn vài nền tảng phổ biến - admin có thể sửa/thêm/khoá sau,
      // giống hệt cách media_sources seed 6 kênh gốc.
      await queryRunner.query(`
        INSERT INTO \`link_categories\` (\`name\`, \`color\`, \`sort_order\`) VALUES
        ('Zalo', '#0068FF', 1), ('Facebook', '#1877F2', 2),
        ('Instagram', '#E1306C', 3), ('Threads', '#000000', 4);
      `);
    }

    const hasGroups = await queryRunner.hasTable('link_groups');
    if (!hasGroups) {
      await queryRunner.query(`
        CREATE TABLE \`link_groups\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`category_id\` int NOT NULL,
          \`name\` varchar(255) NOT NULL,
          \`url\` varchar(500) NOT NULL,
          \`is_active\` tinyint NOT NULL DEFAULT 1,
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_link_groups_category_name\` (\`category_id\`, \`name\`),
          CONSTRAINT \`FK_link_groups_category\` FOREIGN KEY (\`category_id\`)
            REFERENCES \`link_categories\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    const hasMemberships = await queryRunner.hasTable('customer_group_memberships');
    if (!hasMemberships) {
      await queryRunner.query(`
        CREATE TABLE \`customer_group_memberships\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`group_id\` int NOT NULL,
          \`customer_id\` int NOT NULL,
          \`joined\` tinyint NOT NULL DEFAULT 0,
          \`joined_at\` timestamp NULL DEFAULT NULL,
          \`updated_by\` int NULL DEFAULT NULL,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_cgm_group_customer\` (\`group_id\`, \`customer_id\`),
          KEY \`IDX_cgm_customer\` (\`customer_id\`),
          CONSTRAINT \`FK_cgm_group\` FOREIGN KEY (\`group_id\`)
            REFERENCES \`link_groups\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_cgm_customer\` FOREIGN KEY (\`customer_id\`)
            REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_cgm_updated_by\` FOREIGN KEY (\`updated_by\`)
            REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá theo thứ tự ngược - bảng con (có FK trỏ ra) trước, bảng cha sau.
    if (await queryRunner.hasTable('customer_group_memberships')) {
      await queryRunner.query(`DROP TABLE \`customer_group_memberships\`;`);
    }
    if (await queryRunner.hasTable('link_groups')) {
      await queryRunner.query(`DROP TABLE \`link_groups\`;`);
    }
    if (await queryRunner.hasTable('link_categories')) {
      await queryRunner.query(`DROP TABLE \`link_categories\`;`);
    }
  }
}
