/**
 * Utility bỏ dấu tiếng Việt + build tên file "dễ đọc" (không dấu, viết liền,
 * PascalCase từng từ) - dùng để đặt tên OBJECT KEY avatar thay cho UUID
 * ngẫu nhiên (xem uploads.service.ts:presignAvatarUpload).
 *
 * VD: "Nguyễn Văn A" + "Phòng Hỗ trợ Kỹ thuật" + "admin"
 *  -> "NguyenVanA_PhongHoTroKyThuat_Admin.png"
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
 * VD: "Phòng Hỗ trợ Kỹ thuật" -> "PhongHoTroKyThuat"; "mkt_manager" -> "MktManager".
 */
export function toPascalSlug(input: string): string {
  const noDiacritics = removeVietnameseDiacritics(input);
  return noDiacritics
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Build tên file "dễ đọc" từ nhiều phần (VD: tên nhân viên, phòng ban, role),
 * nối bằng dấu gạch dưới `_`. Phần nào rỗng/null/undefined sẽ tự bị bỏ qua
 * (KHÔNG để lại dấu `_` thừa) - vd nhân viên chưa gán phòng ban vẫn ra tên
 * file hợp lệ "AbcXyz_Admin.png" thay vì "AbcXyz__Admin.png".
 * Nếu TẤT CẢ phần đều rỗng (dữ liệu user hỏng/thiếu), fallback về "File" để
 * luôn có 1 tên file hợp lệ, không bao giờ trả chuỗi rỗng.
 */
export function buildReadableFileName(parts: Array<string | null | undefined>, ext: string): string {
  const slugParts = parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => toPascalSlug(p))
    .filter(Boolean); // phòng trường hợp toPascalSlug trả '' (input toàn ký tự đặc biệt)

  const base = slugParts.length > 0 ? slugParts.join('_') : 'File';
  return `${base}.${ext}`;
}
