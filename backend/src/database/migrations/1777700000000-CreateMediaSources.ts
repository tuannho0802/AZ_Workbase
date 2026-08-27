import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⚠️ LÝ DO CẦN MIGRATION NÀY (không chỉ thêm bảng mới):
 * Cột `customers.source` hiện đang là MySQL ENUM cứng
 * ('Facebook','TikTok','Google','Instagram','LinkedIn','Other') - xem
 * `CreateCustomersTable`. Nếu chỉ thêm bảng `media_sources` để admin CRUD tự
 * do mà KHÔNG đổi cột này, mọi customer mới dùng 1 "nguồn" do admin tự thêm
 * (vd "Zalo") sẽ bị MySQL từ chối ngay ở tầng DB (Data truncated for column
 * 'source') vì giá trị đó không nằm trong danh sách ENUM đã "đóng cứng" lúc
 * tạo bảng - hoàn toàn không đáp ứng được yêu cầu "admin tuỳ chỉnh tự do".
 * Nên migration này làm 2 việc:
 *   1) Tạo bảng `media_sources` (danh sách nguồn admin quản lý được).
 *   2) Đổi `customers.source` từ ENUM -> VARCHAR(100) (dữ liệu cũ giữ
 *      nguyên, MySQL tự chuyển đổi an toàn vì mọi giá trị enum cũ đều là
 *      chuỗi hợp lệ trong VARCHAR).
 */
export class CreateMediaSources1777700000000 implements MigrationInterface {
  name = 'CreateMediaSources1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('media_sources');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`media_sources\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`name\` varchar(100) NOT NULL,
          \`is_locked\` tinyint NOT NULL DEFAULT 0,
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_media_sources_name\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Seed đúng các giá trị ENUM cũ, để mọi customer hiện có vẫn khớp với
      // 1 dòng hợp lệ trong bảng mới (không mất/lệch dữ liệu hiển thị).
      await queryRunner.query(`
        INSERT INTO \`media_sources\` (\`name\`, \`sort_order\`) VALUES
        ('Facebook', 1), ('TikTok', 2), ('Google', 3),
        ('Instagram', 4), ('LinkedIn', 5), ('Other', 6);
      `);
    }

    // Đổi cột source từ ENUM cứng -> VARCHAR tự do. Dùng CHANGE COLUMN thay
    // vì MODIFY để tương thích cách TypeORM/migration khác trong dự án đã
    // dùng - giữ nguyên tên cột, chỉ đổi type. NOT NULL giữ nguyên vì cột
    // gốc vốn NOT NULL (source là bắt buộc khi tạo customer).
    await queryRunner.query(`
      ALTER TABLE \`customers\`
      MODIFY COLUMN \`source\` varchar(100) NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Trả lại ENUM cũ - CHỈ an toàn nếu dữ liệu hiện tại không có nguồn nào
    // ngoài 6 giá trị gốc (nếu admin đã thêm nguồn mới và có customer dùng
    // nó, lệnh này sẽ lỗi "Data truncated" - đúng như bản chất của việc
    // downgrade từ tự do về đóng cứng, không có cách nào tránh được).
    await queryRunner.query(`
      ALTER TABLE \`customers\`
      MODIFY COLUMN \`source\` enum('Facebook','TikTok','Google','Instagram','LinkedIn','Other') NOT NULL;
    `);

    const hasTable = await queryRunner.hasTable('media_sources');
    if (hasTable) {
      await queryRunner.query(`DROP TABLE \`media_sources\`;`);
    }
  }
}
