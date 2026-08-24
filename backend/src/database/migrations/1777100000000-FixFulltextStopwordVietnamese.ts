import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX: FULLTEXT ngram index trên customers(name,email,campaign) đang dùng
 * stopword table MẶC ĐỊNH của InnoDB (bảng `innodb_ft_default_stopword_table`),
 * trong đó có các từ 1-2 ký tự như "a", "i", "an", "as", "at"...
 *
 * Với parser `ngram`, MySQL loại bỏ khỏi index MỌI n-gram (mặc định bigram)
 * mà TRÙNG với 1 stopword. Vì "a" là stopword, mọi bigram chứa "a" (vd:
 * "ha", "ah", "an", "va"...) đều bị loại. Tiếng Việt gần như tên nào cũng
 * có chữ "a" -> rất nhiều tên phổ biến ("Lan", "Mai", "An", "Van", "Haha"...)
 * không bao giờ khớp được, trong khi tên không chứa "a" ("Long", "Hoa" - ơ,
 * "Hoa" cũng có "a" nhưng match do vị trí token khác - xem log điều tra gốc)
 * vẫn ra kết quả bình thường -> bug ẩn, chỉ lộ khi search đúng những tên đó.
 *
 * FIX: dùng 1 bảng stopword RỖNG cho riêng bảng `customers`
 * (qua `innodb_ft_user_stopword_table`), để không có từ nào bị lọc khỏi
 * ngram index nữa.
 *
 * ⚠️ InnoDB gắn cấu hình stopword-table vào BẢNG tại thời điểm FULLTEXT
 * index ĐẦU TIÊN được tạo trên bảng đó, và KHÔNG refresh nếu chỉ
 * DROP/CREATE lại 1 trong nhiều FULLTEXT index. Vì customers chỉ có DUY
 * NHẤT 1 FULLTEXT index (ft_customers_search) nên ở đây an toàn: DROP nó,
 * SET SESSION stopword table, rồi CREATE lại là đủ để áp dụng.
 *
 * ⚠️ SET SESSION innodb_ft_user_stopword_table yêu cầu quyền SUPER (MySQL
 * <8.0) hoặc SYSTEM_VARIABLES_ADMIN/SESSION_VARIABLES_ADMIN (MySQL 8.0+).
 * Nếu user DB trên production (vd: managed hosting) không có quyền này,
 * lệnh SET sẽ báo lỗi ngay và migration dừng lại (không rơi vào trạng thái
 * dở dang nguy hiểm) — cần xin nâng quyền hoặc chạy fix qua tài khoản admin
 * của nhà cung cấp DB.
 *
 * Trên bảng customers lớn, CREATE FULLTEXT INDEX build lại toàn bộ index
 * -> nên chạy giờ ít traffic, giống lưu ý ở migration gốc.
 */
export class FixFulltextStopwordVietnamese1777100000000
  implements MigrationInterface {
  private readonly stopwordTable = 'customers_empty_stopwords';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Bảng stopword rỗng, đúng cấu trúc InnoDB yêu cầu: 1 cột VARCHAR
    // tên "value", engine InnoDB.
    // ⚠️ Server này bật `sql_require_primary_key = ON` (phổ biến trên
    // managed hosting như Aiven, để an toàn cho row-based replication) ->
    // mọi bảng InnoDB bắt buộc có PRIMARY KEY, kể cả bảng phụ trợ này.
    // Đặt PK ngay trên cột `value` — vẫn đúng yêu cầu "1 cột tên value,
    // kiểu chuỗi" của InnoDB cho user-defined stopword table.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.stopwordTable}\` (
        value VARCHAR(30) PRIMARY KEY
      ) ENGINE=InnoDB;
    `);

    // 2) Bảng customers chỉ có 1 FULLTEXT index -> drop nó để "gỡ" cấu hình
    // stopword cũ đang gắn với bảng.
    await queryRunner.query(`
      ALTER TABLE customers DROP INDEX ft_customers_search;
    `);

    // 3) Trỏ session sang stopword table rỗng TRƯỚC khi tạo lại FULLTEXT
    // index (DATABASE() lấy đúng tên schema hiện tại, không hard-code).
    await queryRunner.query(`
      SET SESSION innodb_ft_user_stopword_table =
        CONCAT(DATABASE(), '/${this.stopwordTable}');
    `);

    // 4) Tạo lại đúng như migration gốc.
    await queryRunner.query(`
      CREATE FULLTEXT INDEX ft_customers_search
      ON customers(name, email, campaign)
      WITH PARSER ngram;
    `);

    console.log(
      '[MIGRATION] Đã rebuild ft_customers_search với stopword table rỗng - fix bug search tên tiếng Việt chứa "a" (Lan, Mai, An, Van, Haha...)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customers DROP INDEX ft_customers_search;`);
    await queryRunner.query(`SET SESSION innodb_ft_user_stopword_table = DEFAULT;`);
    await queryRunner.query(`
      CREATE FULLTEXT INDEX ft_customers_search
      ON customers(name, email, campaign)
      WITH PARSER ngram;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS \`${this.stopwordTable}\`;`);
  }
}