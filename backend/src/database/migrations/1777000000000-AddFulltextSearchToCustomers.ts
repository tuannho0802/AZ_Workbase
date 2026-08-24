import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung FULLTEXT index (parser `ngram`) cho customers(name, email, campaign),
 * phục vụ query MATCH...AGAINST trong applyCustomerSearch() (customers.service.ts).
 *
 * Trước đây search dùng LOWER(x) LIKE '%...%' — có % ở đầu chuỗi nên MySQL
 * không dùng được index nào, luôn full table scan. Đổi sang FULLTEXT giúp
 * dùng được index thật khi data lớn dần.
 *
 * Dùng parser `ngram` (thay vì mặc định) vì mặc định tách từ theo khoảng
 * trắng — không khớp được kiểu "gõ tới đâu khớp tới đó" ở giữa từ, vốn là
 * hành vi cũ của LIKE '%x%'. `ngram` chia chuỗi thành cụm N ký tự liên tiếp
 * (mặc định N=2, theo biến hệ thống `ngram_token_size`), khớp được cả theo
 * từ lẫn giữa từ — phù hợp cho tiếng Việt (không tách từ rõ ràng bằng dấu
 * cách như tiếng Anh).
 *
 * ⚠️ LƯU Ý QUAN TRỌNG TRƯỚC KHI CHẠY MIGRATION NÀY:
 * 1) Yêu cầu MySQL 5.7+ với InnoDB (đã dùng InnoDB mặc định trong project này).
 * 2) Biến hệ thống `ngram_token_size` (mặc định = 2) quyết định độ dài cụm
 *    ký tự tối thiểu để khớp — với server dùng chung / managed hosting
 *    (VD: Aiven), có thể KHÔNG đổi được biến này (yêu cầu quyền SUPER hoặc
 *    restart server với config khác). Nếu không đổi được, giữ mặc định = 2
 *    vẫn dùng được, chỉ là không khớp được chuỗi tìm kiếm chỉ có 1 ký tự.
 * 3) FULLTEXT + ngram trên MySQL không phân biệt chữ hoa/thường theo mặc định
 *    (case-insensitive theo collation của cột, thường là *_ci) — không cần
 *    LOWER() như LIKE cũ.
 * 4) Trên bảng lớn, CREATE FULLTEXT INDEX có thể mất thời gian (đọc/ghi toàn
 *    bộ bảng để build index) và khoá bảng ngắn hạn tuỳ engine/version — nên
 *    chạy vào giờ ít traffic nếu bảng customers đã có nhiều dữ liệu.
 */
export class AddFulltextSearchToCustomers1777000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FULLTEXT INDEX ft_customers_search
      ON customers(name, email, campaign)
      WITH PARSER ngram;
    `);

    console.log(
      '[MIGRATION] FULLTEXT ngram index (ft_customers_search) created on customers(name, email, campaign)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX ft_customers_search ON customers`);
  }
}
