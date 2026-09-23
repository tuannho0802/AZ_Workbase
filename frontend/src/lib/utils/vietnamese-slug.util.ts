/**
 * Bản FE của `toPascalSlug()` ở backend
 * (`backend/src/common/utils/vietnamese-slug.util.ts`) - PHẢI cho ra kết quả
 * GIỐNG HỆT bản backend cho cùng input, vì dùng để build tên file export
 * NGAY TRÊN TRÌNH DUYỆT thay vì đọc lại header `Content-Disposition` từ
 * response (xem JSDoc `buildExportFilename` ở `customers-export.api.ts`).
 *
 * VD: "Lê Hoàng Tuấn" -> "LeHoangTuan".
 */

/** Bỏ dấu tiếng Việt (kể cả đ/Đ - không tự tách được bằng NFD như các dấu thanh khác). */
export function removeVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Chuyển 1 chuỗi bất kỳ (có dấu, có khoảng trắng, ký tự đặc biệt...) thành
 * dạng "PascalCase liền không dấu" - mỗi từ viết hoa chữ đầu, ghép liền,
 * loại bỏ mọi ký tự không phải chữ/số làm dấu phân cách từ.
 * VD: "Lê Hoàng Tuấn" -> "LeHoangTuan".
 */
export function toPascalSlug(input: string): string {
  const noDiacritics = removeVietnameseDiacritics(input);
  return noDiacritics
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
