import { Logger } from '@nestjs/common';
import { QueryRunner } from 'typeorm';

const logger = new Logger('UtmBackfill');
const BATCH = 5000;

/**
 * Chuẩn hoá tên UTM từ `customers.campaign`: bỏ ký tự zero-width, gộp mọi khoảng trắng (kể cả NBSP) về 1 dấu cách, trim.
 * Việc coi 2 tên là "cùng UTM" (hoa/thường, dấu) do DB quyết định qua UNIQUE collation utf8mb4_unicode_ci.
 */
export function normalizeUtmName(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface UtmBackfillResult {
  customersWithCampaign: number;
  distinctVariants: number;
  utmsBefore: number;
  utmsAfter: number;
  customersAssigned: number;
  customersMissingUtm: number;
  ignoredEmptyVariants: number;
}

/**
 * Đồng bộ `customers.campaign` -> `utms` + `customers.utm_id` (PLAN_UTM_MANAGEMENT mục 4.2). IDEMPOTENT:
 * chạy lại chỉ xử lý KH `utm_id IS NULL AND campaign <> ''`, backup dùng INSERT IGNORE (không ghi đè nguyên văn).
 * Phải được gọi TRONG transaction của caller; nếu đối soát sai sẽ `throw` để caller rollback.
 *  - Raw SQL không lọc `deleted_at` -> KH đã xoá mềm vẫn được backfill.
 *  - Mọi UPDATE đều `updated_at = updated_at` để KHÔNG làm nhảy "Sửa cuối" của khách hàng.
 *  - Ghép khớp bằng bảng tạm theo byte-chính-xác (VARBINARY) rồi để DB quyết định trùng qua UNIQUE `utms.name`.
 */
export async function backfillUtmsFromCampaign(queryRunner: QueryRunner): Promise<UtmBackfillResult> {
  const q = <T = any>(sql: string, params: any[] = []): Promise<T> => queryRunner.query(sql, params);
  const n = (v: any) => Number(v ?? 0);

  // 1) Backup nguyên văn (chỉ chép lần đầu).
  await q(`
    INSERT IGNORE INTO customer_campaign_backup (customer_id, campaign_raw)
    SELECT id, campaign FROM customers WHERE campaign IS NOT NULL AND campaign <> ''
  `);

  const [{ c: utmsBefore }] = await q(`SELECT COUNT(*) AS c FROM utms`);
  const [{ c: customersWithCampaign }] = await q(
    `SELECT COUNT(*) AS c FROM customers WHERE campaign IS NOT NULL AND campaign <> ''`,
  );

  // 2) Các biến thể nguyên văn (so byte-chính-xác) + số lần dùng: phổ biến nhất được tạo trước => thành tên hiển thị.
  const variants: { raw: string; cnt: string | number }[] = await q(`
    SELECT ANY_VALUE(campaign) AS raw, COUNT(*) AS cnt
    FROM customers
    WHERE utm_id IS NULL AND campaign IS NOT NULL AND campaign <> ''
    GROUP BY BINARY campaign
  `);

  const prepared = variants
    .map((v) => ({ raw: String(v.raw), cnt: n(v.cnt), name: normalizeUtmName(String(v.raw)) }))
    // Đồng hạng: ưu tiên biến thể có chữ hoa (đẹp hơn toàn chữ thường), rồi theo tên để thứ tự xác định.
    .sort(
      (a, b) =>
        b.cnt - a.cnt ||
        Number(b.name !== b.name.toLowerCase()) - Number(a.name !== a.name.toLowerCase()) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0),
    );

  // 3) Tạo UTM tuần tự (thứ tự xác định); biến thể chỉ khác hoa/thường/dấu đụng UNIQUE và bị bỏ qua.
  for (const v of prepared) {
    if (!v.name) continue;
    await q(
      `INSERT INTO utms (name, visibility, is_active) VALUES (?, 'shared', 1) ON DUPLICATE KEY UPDATE id = id`,
      [v.name],
    );
  }

  // Bảng tạm raw(byte) -> utm_id; NULL = biến thể rỗng sau chuẩn hoá (bỏ qua, giữ nguyên campaign).
  await q(`DROP TEMPORARY TABLE IF EXISTS tmp_utm_map`);
  await q(`CREATE TEMPORARY TABLE tmp_utm_map (raw VARBINARY(400) NOT NULL PRIMARY KEY, utm_id INT NULL)`);
  let ignoredEmptyVariants = 0;
  for (const v of prepared) {
    let utmId: number | null = null;
    if (v.name) {
      const rows = await q(`SELECT id FROM utms WHERE name = ? COLLATE utf8mb4_unicode_ci LIMIT 1`, [v.name]);
      if (!rows.length) throw new Error(`[UTM backfill] Không tìm thấy UTM vừa tạo cho "${v.name}"`);
      utmId = n(rows[0].id);
    } else {
      ignoredEmptyVariants++;
    }
    await q(`INSERT INTO tmp_utm_map (raw, utm_id) VALUES (CAST(? AS BINARY), ?)`, [v.raw, utmId]);
  }

  // 4) Gán utm_id theo lô id (không khoá cả bảng) + 5) chuẩn hoá snapshot campaign = utm.name.
  const [{ mn, mx }] = await q(
    `SELECT MIN(id) AS mn, MAX(id) AS mx FROM customers WHERE campaign IS NOT NULL AND campaign <> ''`,
  );
  if (mn !== null && mn !== undefined) {
    for (let from = n(mn); from <= n(mx); from += BATCH) {
      const to = from + BATCH - 1;
      await q(
        `UPDATE customers c
         JOIN tmp_utm_map m ON CAST(c.campaign AS BINARY) = m.raw
         SET c.utm_id = m.utm_id, c.updated_at = c.updated_at
         WHERE c.utm_id IS NULL AND m.utm_id IS NOT NULL AND c.id BETWEEN ? AND ?`,
        [from, to],
      );
      await q(
        `UPDATE customers c
         JOIN utms u ON u.id = c.utm_id
         SET c.campaign = u.name, c.updated_at = c.updated_at
         WHERE CAST(c.campaign AS BINARY) <> CAST(u.name AS BINARY) AND c.id BETWEEN ? AND ?`,
        [from, to],
      );
    }
  }

  // 6) Ghi utm_id vào backup để đối soát ngược.
  await q(`
    UPDATE customer_campaign_backup b JOIN customers c ON c.id = b.customer_id
    SET b.utm_id = c.utm_id WHERE b.utm_id IS NULL AND c.utm_id IS NOT NULL
  `);

  // 7) Đối soát - sai là throw => caller rollback toàn bộ DML.
  const [{ c: missingBackup }] = await q(`
    SELECT COUNT(*) AS c FROM customers c
    LEFT JOIN customer_campaign_backup b ON b.customer_id = c.id
    WHERE c.campaign IS NOT NULL AND c.campaign <> '' AND b.customer_id IS NULL
  `);
  if (n(missingBackup) !== 0) throw new Error(`[UTM backfill] ${missingBackup} KH có UTM nhưng thiếu dòng backup`);

  const [{ c: unassigned }] = await q(`
    SELECT COUNT(*) AS c FROM customers c
    JOIN tmp_utm_map m ON CAST(c.campaign AS BINARY) = m.raw
    WHERE c.utm_id IS NULL AND m.utm_id IS NOT NULL
  `);
  if (n(unassigned) !== 0) throw new Error(`[UTM backfill] ${unassigned} KH có UTM nhưng utm_id vẫn NULL`);

  // Không KH nào bị gán sai UTM: theo backup nguyên văn -> bảng tạm -> utm_id phải khớp c.utm_id.
  const [{ c: wrong }] = await q(`
    SELECT COUNT(*) AS c FROM customers c
    JOIN customer_campaign_backup b ON b.customer_id = c.id
    JOIN tmp_utm_map m ON CAST(b.campaign_raw AS BINARY) = m.raw
    WHERE m.utm_id IS NOT NULL AND c.utm_id IS NOT NULL AND c.utm_id <> m.utm_id
  `);
  if (n(wrong) !== 0) throw new Error(`[UTM backfill] ${wrong} KH bị gán sai UTM so với backup`);

  const [{ c: utmsAfter }] = await q(`SELECT COUNT(*) AS c FROM utms`);
  if (n(utmsBefore) === 0) {
    const [{ c: distinctMapped }] = await q(`SELECT COUNT(DISTINCT utm_id) AS c FROM tmp_utm_map WHERE utm_id IS NOT NULL`);
    if (n(distinctMapped) !== n(utmsAfter)) {
      throw new Error(`[UTM backfill] Số UTM (${utmsAfter}) khác số nhóm đã gộp (${distinctMapped})`);
    }
  }

  // KH phát sinh trong lúc chạy (chưa nằm trong bảng tạm) - không throw, chạy lại `npm run utm:backfill` để vá.
  const [{ c: missing }] = await q(`
    SELECT COUNT(*) AS c FROM customers
    WHERE utm_id IS NULL AND campaign IS NOT NULL AND TRIM(campaign) <> ''
      AND CAST(campaign AS BINARY) NOT IN (SELECT raw FROM tmp_utm_map WHERE utm_id IS NULL)
  `);
  const [{ c: assigned }] = await q(`SELECT COUNT(*) AS c FROM customers WHERE utm_id IS NOT NULL`);
  await q(`DROP TEMPORARY TABLE IF EXISTS tmp_utm_map`);

  const result: UtmBackfillResult = {
    customersWithCampaign: n(customersWithCampaign),
    distinctVariants: prepared.length,
    utmsBefore: n(utmsBefore),
    utmsAfter: n(utmsAfter),
    customersAssigned: n(assigned),
    customersMissingUtm: n(missing),
    ignoredEmptyVariants,
  };
  logger.log(`[UTM backfill] ${JSON.stringify(result)}`);
  if (result.customersMissingUtm > 0) {
    logger.warn(`[UTM backfill] ${result.customersMissingUtm} KH còn thiếu utm_id (phát sinh khi chạy) - chạy lại npm run utm:backfill`);
  }
  return result;
}
