/**
 * ⚠️ BUG THẬT (điều tra 2026-09-23, yêu cầu người dùng "vài tên search không
 * ra") - đã tái hiện bằng MySQL 8 thật cùng đúng FULLTEXT ngram index +
 * stopword-table rỗng giống hệt migration `FixFulltextStopwordVietnamese`:
 *
 * `applyCustomerSearch()` (customers.service.ts) bọc search trong dấu " "
 * (phrase search BOOLEAN MODE) để khớp ĐÚNG cụm liên tục người dùng gõ. Với
 * parser `ngram`, MySQL chỉ coi dấu CÁCH ASCII (U+0020) hoặc TAB là ranh giới
 * giữa 2 "từ". Các ký tự "trông giống dấu cách" khác - non-breaking space
 * U+00A0 (rất hay dính khi copy tên từ Excel/Word/Zalo), zero-width space
 * U+200B, ideographic space U+3000 (hay dính khi paste từ nguồn tiếng Trung/
 * Nhật) - KHÔNG được ngram coi là ranh giới, nên "test" + U+00A0 + "lại" bị
 * tokenize thành 1 CHUỖI LIÊN TỤC thay vì 2 từ tách biệt.
 *
 * Hậu quả: dữ liệu trông giống hệt "test lại" bằng mắt thường, `LIKE
 * '%test lại%'` VẪN khớp (collation utf8mb4_unicode_ci coi 2 loại dấu cách
 * này tương đương), tìm bằng 1 từ đơn (`+test`, `+lại`) VẪN ra - nhưng phrase
 * search cụm "test lại" (đúng thứ người dùng gõ trong ô tìm kiếm) thì KHÔNG,
 * vì thứ tự token ở 2 bên (dữ liệu ngram hoá thành 1 từ dính, query ngram hoá
 * thành 2 từ tách) không còn khớp vị trí. Kịch bản y hệt trong ảnh chụp màn
 * hình người dùng gửi (thấy "test lại" trong danh sách, gõ y chang vào ô tìm
 * kiếm lại ra "Trống").
 *
 * FIX 2 lớp:
 * 1) (Về sau) Chuẩn hoá `name`/`email`/`campaign` bằng hàm này TRƯỚC khi lưu
 *    DB ở create()/update()/import - không cho các ký tự này lọt vào nữa.
 * 2) (Về sau + phòng thủ 2 lớp) Chuẩn hoá luôn chuỗi `search` người dùng gõ
 *    trong `applyCustomerSearch()` - phòng trường hợp họ paste search text
 *    có dính ký tự lạ.
 * 3) (Dữ liệu CŨ đã lỡ lưu) Xem migration
 *    `CleanupWeirdWhitespaceInCustomers` chạy 1 lần để dọn lại toàn bộ hàng
 *    đã tồn tại.
 */

// Danh sách ký tự Unicode "trông giống dấu cách" hay gặp trong dữ liệu paste
// từ Excel/Word/Zalo/Facebook Ads export, nhưng KHÔNG được MySQL ngram parser
// coi là ranh giới từ. Quy hết về dấu cách ASCII thường (U+0020).
const WEIRD_WHITESPACE_REGEX =
  /[\u00A0\u1680\u2000-\u200A\u200B\u202F\u205F\u3000\uFEFF]/g;

/**
 * Chuẩn hoá 1 chuỗi text dùng để LƯU hoặc TÌM KIẾM: thay mọi ký tự "giống dấu
 * cách" (NBSP, zero-width space, ideographic space...) bằng dấu cách ASCII
 * thường, gộp nhiều dấu cách liên tiếp thành 1, rồi trim 2 đầu.
 *
 * Trả về `null` nếu input rỗng/chỉ toàn khoảng trắng (khớp hành vi các chỗ
 * đang dùng `.trim() === '' ? null : ...` sẵn có trong customers.service.ts).
 */
export function normalizeSearchableText(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined) return null;
  const cleaned = input
    .replace(WEIRD_WHITESPACE_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? null : cleaned;
}
