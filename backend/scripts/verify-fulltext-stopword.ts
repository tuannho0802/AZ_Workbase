/**
 * scripts/verify-fulltext-stopword.ts
 *
 * Kiểm tra + tự sửa (idempotent) bug: FULLTEXT search trên bảng `customers`
 * bỏ sót các tên chứa bigram trùng stopword mặc định của InnoDB (vd: "Hana"
 * chứa bigram "an", "Lan", "An"...) sau khi DB local bị restore/clone.
 *
 * LÝ DO VIẾT LẠI (so với bản gốc):
 * Bản gốc dùng `SET GLOBAL innodb_ft_aux_table` + đọc
 * INFORMATION_SCHEMA.INNODB_FT_INDEX_TABLE để soi trực tiếp bigram trong
 * FTS index. Cách đó đòi quyền SUPER / SYSTEM_VARIABLES_ADMIN — bị MySQL
 * managed (không phải root cục bộ) chặn thẳng:
 *   ER_SPECIFIC_ACCESS_DENIED_ERROR: Access denied; you need SUPER or
 *   SYSTEM_VARIABLES_ADMIN privilege(s)
 *
 * Bản này thay hoàn toàn bước introspect đó bằng "functional canary check":
 * chèn tạm 1 dòng có tên chứa "Hana" vào chính bảng customers, search bằng
 * MATCH...AGAINST so với LIKE, rồi xoá dòng canary đi. Chỉ cần quyền
 * SELECT/INSERT/DELETE bình thường mà app đã có — không đụng biến global.
 *
 * SỬA LẦN 2 (khớp đúng backend/src/database/entities/customer.entity.ts thật):
 * - Cột `input_date` (date, NOT NULL, KHÔNG có default) — thiếu gây lỗi
 *   `ER_NO_DEFAULT_FOR_FIELD: Field 'input_date' doesn't have a default value`.
 *   -> Đã thêm `input_date` = CURDATE() vào câu INSERT.
 * - Cột `created_by` (int, NOT NULL, KHÔNG có default — đây là field
 *   `createdBy_OLD` trong entity, khác với `created_by_id` mới) — cũng bắt
 *   buộc phải truyền, nếu không sẽ lỗi tương tự ngay sau khi fix input_date.
 * - `sales_user_id` và `department_id` trong entity thật đã nullable (xem
 *   migration `AllowNullSalesAndDepartmentInCustomers`) -> KHÔNG cần mượn
 *   department nữa, script chỉ còn cần 1 user bất kỳ để làm `created_by`.
 * - `phone` có `unique: true` -> dùng số ngẫu nhiên/theo timestamp thay vì
 *   hardcode '0900000000', để tránh đụng dữ liệu thật hoặc đụng nhau khi
 *   nhiều tài khoản cùng chạy script song song trên cùng 1 DB dev/staging.
 *
 * CHẠY:
 *   npx ts-node -r tsconfig-paths/register scripts/verify-fulltext-stopword.ts
 *   npx ts-node -r tsconfig-paths/register scripts/verify-fulltext-stopword.ts --fix
 */

import { DataSource, QueryRunner } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const CANARY_MARK = '__FTS_CANARY__';
const CANARY_NAME = `${CANARY_MARK} Hana`;
const STOPWORD_TABLE_NAME = 'customers_empty_stopwords';

// ---------------------------------------------------------------------------
// Kết nối DB — dùng đúng biến env như backend/.env.development
// ---------------------------------------------------------------------------
function buildDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: false,
    logging: false,
  });
}

// Số điện thoại canary duy nhất mỗi lần chạy (cột `phone` có unique: true) —
// tránh đụng số thật và đụng nhau khi nhiều tài khoản chạy song song.
function buildCanaryPhone(): string {
  const suffix = Date.now().toString().slice(-9); // 9 chữ số cuối của timestamp
  return `0${suffix}`.padEnd(10, '0').slice(0, 10);
}

// ---------------------------------------------------------------------------
// FUNCTIONAL CANARY CHECK
// Không dùng SET GLOBAL / INNODB_FT_* — chỉ cần SELECT/INSERT/DELETE thường.
// KHÔNG bọc trong transaction để tránh FTS cache của InnoDB chưa flush khi
// SELECT ngay sau INSERT trong cùng transaction.
// ---------------------------------------------------------------------------
async function functionalCanaryCheck(
  queryRunner: QueryRunner,
): Promise<{ ok: boolean; detail: string }> {
  // Chỉ cần 1 user bất kỳ để làm `created_by` (NOT NULL, không default).
  // `sales_user_id` / `department_id` đã nullable trong entity thật nên
  // KHÔNG cần mượn department nữa.
  const [user] = await queryRunner.query(`SELECT id FROM users LIMIT 1`);
  if (!user) {
    throw new Error(
      'Không tìm thấy user nào trong DB để làm created_by cho dòng canary test. ' +
      'Cần ít nhất 1 user đã seed.',
    );
  }

  // Dọn canary cũ (phòng trường hợp lần chạy trước bị crash giữa chừng)
  await queryRunner.query(`DELETE FROM customers WHERE name LIKE ?`, [
    `${CANARY_MARK}%`,
  ]);

  const canaryPhone = buildCanaryPhone();

  await queryRunner.query(
    `INSERT INTO customers
       (name, phone, source, created_by, input_date)
     VALUES (?, ?, 'Other', ?, CURDATE())`,
    [CANARY_NAME, canaryPhone, user.id],
  );

  try {
    const matched = await queryRunner.query(
      `SELECT id FROM customers
       WHERE MATCH(name, email, campaign) AGAINST('+Hana' IN BOOLEAN MODE)
         AND name LIKE ?`,
      [`${CANARY_MARK}%`],
    );
    const foundViaLike = await queryRunner.query(
      `SELECT id FROM customers WHERE name LIKE ?`,
      [`${CANARY_MARK}%`],
    );

    const ok = matched.length > 0 && foundViaLike.length > 0;
    return {
      ok,
      detail: ok
        ? 'FULLTEXT tìm ra "Hana" đúng như LIKE — stopword KHÔNG chặn bigram.'
        : `FULLTEXT trả ${matched.length} kết quả, LIKE trả ${foundViaLike.length} ` +
        `dòng — stopword ĐANG chặn (bug tái hiện).`,
    };
  } finally {
    // Luôn dọn dẹp dòng canary dù pass hay fail
    await queryRunner.query(`DELETE FROM customers WHERE name LIKE ?`, [
      `${CANARY_MARK}%`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// FIX: drop + tạo lại FULLTEXT index, trỏ đúng stopword-table rỗng.
// SET SESSION (không phải SET GLOBAL) — không đòi quyền SUPER.
//
// LƯU Ý: fix này giống hệt logic migration đã có sẵn trong repo
// (`1777100000000-FixFulltextStopwordVietnamese.ts`). Script này là công cụ
// verify/fix độc lập, không thay thế migration đó — nếu migration kia CHƯA
// từng chạy thành công trên DB đang test (vd. do lỗi quyền lúc chạy migrate),
// applyFix() ở đây sẽ áp dụng đúng hiệu ứng tương đương.
// ---------------------------------------------------------------------------
async function applyFix(queryRunner: QueryRunner): Promise<void> {
  console.log('[fix] Tạo bảng stopword rỗng nếu chưa có...');
  await queryRunner.query(
    `CREATE TABLE IF NOT EXISTS \`${STOPWORD_TABLE_NAME}\` (
       value VARCHAR(30) PRIMARY KEY
     ) ENGINE=InnoDB`,
  );

  console.log('[fix] Trỏ session sang stopword-table rỗng...');
  await queryRunner.query(
    `SET SESSION innodb_ft_user_stopword_table =
       CONCAT(DATABASE(), '/${STOPWORD_TABLE_NAME}')`,
  );

  console.log('[fix] Drop FULLTEXT index cũ (nếu tồn tại)...');
  const existingIndexes: Array<{ Key_name: string }> = await queryRunner.query(
    `SHOW INDEX FROM customers WHERE Key_name = 'ft_customers_search'`,
  );
  if (existingIndexes.length > 0) {
    await queryRunner.query(
      `ALTER TABLE customers DROP INDEX ft_customers_search`,
    );
  }

  console.log('[fix] Tạo lại FULLTEXT index với parser ngram...');
  await queryRunner.query(
    `CREATE FULLTEXT INDEX ft_customers_search
     ON customers(name, email, campaign)
     WITH PARSER ngram`,
  );

  console.log('[fix] Xong.');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  const shouldFix = process.argv.includes('--fix');
  const dataSource = buildDataSource();
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    console.log('[verify-fulltext-stopword] Kiểm tra hiện trạng (trước fix)...');
    const before = await functionalCanaryCheck(queryRunner);
    console.log(`  -> ${before.detail}`);

    if (before.ok) {
      console.log('✅ Không phát hiện bug. Không cần làm gì thêm.');
      return;
    }

    console.log('❌ Phát hiện bug: search bị chặn bởi stopword mặc định.');

    if (!shouldFix) {
      console.log(
        '\nChạy lại kèm --fix để tự động sửa:\n' +
        '  npx ts-node -r tsconfig-paths/register scripts/verify-fulltext-stopword.ts --fix',
      );
      process.exitCode = 1;
      return;
    }

    await applyFix(queryRunner);

    console.log('[verify-fulltext-stopword] Kiểm tra lại sau khi fix...');
    const after = await functionalCanaryCheck(queryRunner);
    console.log(`  -> ${after.detail}`);

    if (after.ok) {
      console.log('✅ Fix thành công — search "Hana" đã hoạt động đúng.');
    } else {
      console.error('❌ Fix KHÔNG thành công — cần kiểm tra thủ công.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[verify-fulltext-stopword] Lỗi khi chạy script:', err);
    process.exitCode = 1;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main();