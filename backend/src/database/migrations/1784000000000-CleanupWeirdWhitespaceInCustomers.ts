import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lớp fix thứ 3 (dữ liệu CŨ) trong bug search "test lại" ra Trống dù thấy
 * rõ trong bảng - xem chú thích đầy đủ ở `text-normalize.util.ts`.
 *
 * Data cũ đã lỡ lưu NBSP (U+00A0)/zero-width space (U+200B)/ideographic
 * space (U+3000)... bên trong name/email/campaign (dính khi copy-paste từ
 * Excel/Word/Zalo/Facebook Ads) vẫn đứng yên tại chỗ dù code create()/
 * update()/search() đã được sửa (2 lớp fix trước chỉ chặn dữ liệu MỚI và
 * chuẩn hoá QUERY tìm kiếm - không tự sửa hàng đã tồn tại). Migration này
 * quét 1 lần, thay các ký tự đó bằng dấu cách ASCII thường, gộp nhiều dấu
 * cách liên tiếp, trim 2 đầu.
 *
 * An toàn để chạy lại nhiều lần (idempotent): sau lần chạy đầu, REGEXP dưới
 * đây sẽ không còn khớp hàng nào nữa nên UPDATE tiếp theo là no-op.
 *
 * ⚠️ Yêu cầu MySQL 8.0.4+ cho REGEXP_REPLACE (project đã dùng MySQL 8.0+,
 * xem README_AZWORKBASE_PROJECT.md).
 *
 * ⚠️ BUG THẬT ĐÃ GẶP (2026-09-23, log chạy thật trên máy người dùng):
 * `ER_REGEXP_INVALID_RANGE`. Nguyên nhân: bản đầu nhúng thẳng pattern
 * `\x{00A0}...` vào TEXT của câu SQL bằng template string. Backslash đơn
 * trong 1 chuỗi literal `'...'` của MySQL KHÔNG phải escape sequence hợp lệ
 * (`\x` không nằm trong danh sách MySQL công nhận: \n \t \\ \' \" \0 \b \r
 * \Z \% \_) → MySQL tự ÂM THẦM XOÁ backslash đó trước khi đưa cho regex
 * engine, biến `\x{00A0}` thành `x{00A0}` (mất `\`) → ICU regex hiểu nhầm
 * thành 1 character-class chứa range `0}-x` ngược thứ tự → lỗi
 * "[x-y] character range where x comes after y". Fix triệt để: KHÔNG BAO
 * GIỜ nhúng pattern chứa backslash vào text SQL bằng string interpolation -
 * luôn truyền qua bound parameter (`?`), vì tham số được driver gửi dưới
 * dạng data thuần, không đi qua bước parse escape của MySQL string literal.
 */
const WEIRD_WHITESPACE_PATTERN =
  '[\\u00A0\\u1680\\u2000-\\u200A\\u200B\\u202F\\u205F\\u3000\\uFEFF]';
const COLLAPSE_MULTI_SPACE_PATTERN = ' {2,}';
const HAS_ISSUE_PATTERN = '( {2,})|(^ )|( $)';

export class CleanupWeirdWhitespaceInCustomers1784000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['name', 'email', 'campaign']) {
      // Bước 1: quy toàn bộ ký tự "giống dấu cách" lạ về dấu cách ASCII
      // (U+0020). Pattern truyền qua `?` - KHÔNG interpolate vào text SQL.
      await queryRunner.query(
        `UPDATE customers
         SET ${column} = REGEXP_REPLACE(${column}, ?, ' ')
         WHERE ${column} IS NOT NULL
           AND ${column} REGEXP ?`,
        [WEIRD_WHITESPACE_PATTERN, WEIRD_WHITESPACE_PATTERN],
      );

      // Bước 2: gộp nhiều dấu cách liên tiếp thành 1 + trim 2 đầu (chạy
      // riêng, không gộp chung Bước 1, để không phụ thuộc thứ tự evaluate
      // của REGEXP_REPLACE lồng nhau trên MySQL).
      await queryRunner.query(
        `UPDATE customers
         SET ${column} = TRIM(REGEXP_REPLACE(${column}, ?, ' '))
         WHERE ${column} IS NOT NULL
           AND ${column} REGEXP ?`,
        [COLLAPSE_MULTI_SPACE_PATTERN, HAS_ISSUE_PATTERN],
      );
    }

    console.log(
      '[MIGRATION] Đã dọn ký tự khoảng trắng lạ (NBSP/zero-width space/...) trong customers.name/email/campaign',
    );
  }

  public async down(): Promise<void> {
    // Không thể khôi phục chính xác ký tự gốc đã bị thay (chủ đích - đây là
    // dữ liệu rác, không phải thông tin nghiệp vụ cần giữ). down() no-op.
  }
}