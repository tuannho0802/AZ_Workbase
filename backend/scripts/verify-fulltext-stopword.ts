/**
 * VERIFY + AUTO-FIX: cấu hình stopword của FULLTEXT index `ft_customers_search`.
 *
 * BỐI CẢNH BUG ĐÃ GẶP THẬT (2026-09-16, xem WORKFLOW_LOG.md):
 * Migration `FixFulltextStopwordVietnamese1777100000000` gắn 1 stopword table
 * RỖNG (`customers_empty_stopwords`) vào index `ft_customers_search` để search
 * tên tiếng Việt chứa chữ "a" ngắn (Lan, Mai, An, Hana...) không bị lọc sai.
 *
 * ⚠️ VẤN ĐỀ #1 — Vì sao cấu hình bị mất sau restore/clone DB:
 * Cấu hình stopword-table KHÔNG nằm trong DDL (`SHOW CREATE TABLE` vẫn hiện
 * đúng `WITH PARSER ngram` sau restore) — nó là state nội bộ InnoDB, chỉ được
 * set tại đúng thời điểm `CREATE FULLTEXT INDEX` chạy trong 1 session cụ thể.
 * Backup/restore (mysqldump → import) hoặc clone DB qua GUI thường DROP+CREATE
 * lại bảng/rebuild FULLTEXT index mà KHÔNG set `innodb_ft_user_stopword_table`
 * trước → index mới âm thầm quay về stopword MẶC ĐỊNH → bug tái phát, dù bảng
 * `migrations` vẫn báo migration này đã "chạy" (chỉ là 1 dòng DATA copy theo
 * dump, không phải chạy lại thật).
 *
 * ⚠️ VẤN ĐỀ #2 — Vì sao KHÔNG được dùng `information_schema.INNODB_FT_CONFIG`
 * để kiểm tra (đã verify thật, không suy đoán):
 * Cột `stopword_table_name` trong bảng này có thể trả về giá trị CŨ/SAI LỆCH
 * (báo đang dùng bảng rỗng) ngay cả khi index vừa bị rebuild về stopword MẶC
 * ĐỊNH thật sự — đã tái hiện case này bằng tay: metadata báo đúng nhưng search
 * "Hana" vẫn ra rỗng. Không rõ đây là cache MySQL hay hành vi tài liệu hoá
 * thiếu đầy đủ — nhưng thực nghiệm cho thấy field này KHÔNG đáng tin.
 *
 * → Script này dùng bằng chứng THẬT thay vì đọc metadata: kiểm tra trực tiếp
 * xem 1 vài "canary bigram" thuộc danh sách stopword mặc định của InnoDB
 * (an/in/on...) có thực sự tồn tại trong FTS index hay không, qua
 * `information_schema.INNODB_FT_INDEX_TABLE`. Nếu KHÔNG có canary nào tồn
 * tại dù bảng có nhiều dữ liệu → chắc chắn đang bị lọc stopword sai.
 *
 * CÁCH DÙNG:
 *   npx ts-node -r tsconfig-paths/register scripts/verify-fulltext-stopword.ts
 *        → chỉ kiểm tra, thoát mã lỗi khác 0 nếu sai cấu hình (dùng được
 *          trong CI/health-check, không tự sửa gì).
 *   npx ts-node -r tsconfig-paths/register scripts/verify-fulltext-stopword.ts --fix
 *        → tự DROP/CREATE lại index với đúng stopword rỗng nếu phát hiện sai.
 *
 * NÊN CHẠY LỆNH NÀY (bản --fix) SAU MỖI LẦN:
 *   - Restore DB từ file dump (mysqldump/backup).
 *   - Clone/copy DB qua GUI (TablePlus, "Local" app, HeidiSQL...).
 *   - Import DB production về máy local để debug.
 *
 * ⚠️ Yêu cầu quyền: cả bước kiểm tra (`SET GLOBAL innodb_ft_aux_table`) lẫn
 * bước sửa (`SET SESSION innodb_ft_user_stopword_table`) đều cần quyền
 * SUPER hoặc SYSTEM_VARIABLES_ADMIN/SESSION_VARIABLES_ADMIN (MySQL 8+). Nếu
 * user DB không có quyền này (phổ biến trên managed hosting), script sẽ báo
 * lỗi rõ ràng ngay từ bước kiểm tra.
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const STOPWORD_TABLE = 'customers_empty_stopwords';
// Các bigram gần như CHẮC CHẮN xuất hiện trong bất kỳ tập dữ liệu khách hàng
// Việt Nam nào có kích thước đáng kể (VD: "Văn" trong "Nguyễn Văn X" cực phổ
// biến -> chứa "an"). Nếu KHÔNG cái nào trong số này tồn tại trong FTS index
// dù bảng có đủ dữ liệu, gần như chắc chắn stopword mặc định đang lọc chúng.
const CANARY_BIGRAMS = ['an', 'on', 'in'];
const MIN_ROWS_FOR_RELIABLE_CHECK = 20;

async function main() {
  const shouldFix = process.argv.includes('--fix');

  const sslConfig = process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT } : undefined;
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ...(sslConfig ? { ssl: sslConfig, extra: { ssl: sslConfig } } : {}),
  });

  await dataSource.initialize();

  try {
    const dbNameRows: any[] = await dataSource.query('SELECT DATABASE() AS db');
    const dbName = dbNameRows[0].db;

    const [{ cnt: rowCount }]: any[] = await dataSource.query(
      'SELECT COUNT(*) AS cnt FROM customers',
    );

    if (rowCount < MIN_ROWS_FOR_RELIABLE_CHECK) {
      console.warn(
        `[verify-fulltext-stopword] ⚠️ Bảng customers chỉ có ${rowCount} dòng — quá ít để kiểm tra` +
          ' đáng tin cậy bằng canary bigram (có thể báo sai). Cân nhắc chạy trên DB có dữ liệu thật.',
      );
    }

    // ⚠️ innodb_ft_aux_table là GLOBAL variable — cần quyền SUPER/SYSTEM_VARIABLES_ADMIN.
    await dataSource.query(`SET GLOBAL innodb_ft_aux_table = ?`, [`${dbName}/customers`]);

    const foundCanaries: string[] = [];
    for (const word of CANARY_BIGRAMS) {
      const rows: any[] = await dataSource.query(
        `SELECT DISTINCT WORD FROM information_schema.INNODB_FT_INDEX_TABLE WHERE WORD = ?`,
        [word],
      );
      if (rows.length > 0) foundCanaries.push(word);
    }

    const isCorrect = foundCanaries.length > 0;

    console.log('[verify-fulltext-stopword] DB:', dbName, '| Số dòng customers:', rowCount);
    console.log(
      '[verify-fulltext-stopword] Canary bigram tìm thấy trong FTS index:',
      foundCanaries.length ? foundCanaries.join(', ') : '(không có cái nào)',
    );

    if (isCorrect) {
      console.log('[verify-fulltext-stopword] ✅ ĐÚNG cấu hình — search tên tiếng Việt (Hana/Lan/An...) hoạt động bình thường.');
      process.exit(0);
    }

    console.error(
      '[verify-fulltext-stopword] ❌ SAI cấu hình — không canary bigram nào tồn tại trong FTS index, dù' +
        ' bảng có đủ dữ liệu. Index đang dùng stopword MẶC ĐỊNH thay vì bảng rỗng. Search tên chứa' +
        ' "a" ngắn (Hana, Lan, An, Mai...) sẽ bị lọc sai. Nguyên nhân thường gặp: DB vừa được restore/clone.',
    );

    if (!shouldFix) {
      console.error('[verify-fulltext-stopword] Chạy lại kèm --fix để tự sửa.');
      process.exit(1);
    }

    console.log('[verify-fulltext-stopword] Đang tự sửa (rebuild FULLTEXT index với stopword rỗng)...');

    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS \`${STOPWORD_TABLE}\` (
        value VARCHAR(30) PRIMARY KEY
      ) ENGINE=InnoDB;
    `);
    await dataSource.query(`ALTER TABLE customers DROP INDEX ft_customers_search;`);
    // ⚠️ innodb_ft_user_stopword_table là SESSION variable — PHẢI set trong
    // CÙNG session trước khi CREATE FULLTEXT INDEX (khác connection sẽ không
    // có tác dụng). TypeORM tái dùng 1 connection cho các query tuần tự ở
    // đây nên đảm bảo đúng session.
    await dataSource.query(
      `SET SESSION innodb_ft_user_stopword_table = CONCAT(DATABASE(), '/${STOPWORD_TABLE}');`,
    );
    await dataSource.query(`
      CREATE FULLTEXT INDEX ft_customers_search
      ON customers(name, email, campaign)
      WITH PARSER ngram;
    `);

    // Verify lại bằng đúng phép thử canary, không tin ngay là đã xong.
    await dataSource.query(`SET GLOBAL innodb_ft_aux_table = NULL;`);
    await dataSource.query(`SET GLOBAL innodb_ft_aux_table = ?`, [`${dbName}/customers`]);
    const afterRows: any[] = await dataSource.query(
      `SELECT DISTINCT WORD FROM information_schema.INNODB_FT_INDEX_TABLE WHERE WORD = 'an'`,
    );

    if (afterRows.length === 0) {
      console.error('[verify-fulltext-stopword] ❌ Đã rebuild nhưng verify lại VẪN thất bại — cần kiểm tra thủ công.');
      process.exit(1);
    }

    console.log('[verify-fulltext-stopword] ✅ Đã rebuild và verify lại thành công. Search "Hana"/"Lan"/"An" giờ hoạt động đúng.');
    process.exit(0);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('[verify-fulltext-stopword] Lỗi khi chạy script:', err);
  process.exit(1);
});
