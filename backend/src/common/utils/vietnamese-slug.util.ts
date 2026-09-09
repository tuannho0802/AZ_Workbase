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
 * luôn có 1 tên file hợp lệ, không bao giờ trả chuỗi rỗng. Dùng cho AVATAR
 * (xem uploads.service.ts:presignAvatarUpload). Cho ẢNH ĐÍNH KÈM NGHỈ PHÉP,
 * dùng `buildAttachmentFileName` bên dưới (cần thêm số thứ tự + ngày).
 */
export function buildReadableFileName(parts: Array<string | null | undefined>, ext: string): string {
  const slugParts = parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => toPascalSlug(p))
    .filter(Boolean); // phòng trường hợp toPascalSlug trả '' (input toàn ký tự đặc biệt)

  const base = slugParts.length > 0 ? slugParts.join('_') : 'File';
  return `${base}.${ext}`;
}

/**
 * Build tên file "dễ đọc" cho ẢNH ĐÍNH KÈM ĐƠN NGHỈ PHÉP - khác avatar ở chỗ
 * PHẢI thêm số thứ tự (N, bắt đầu từ 1 - phân biệt nhiều ảnh trong CÙNG 1
 * đơn) và ngày tạo (dd-m-yy, KHÔNG PascalCase/bỏ dấu gạch ngang - đây là số,
 * không phải chữ, giữ nguyên định dạng ngày cho dễ đọc khi liệt kê theo thời
 * gian). VD: "NguyenVanA_Employee_NghiOm_1_8-9-26.png".
 */
export function buildAttachmentFileName(
  parts: Array<string | null | undefined>,
  index: number,
  dateLabel: string,
  ext: string,
): string {
  const slugParts = parts
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => toPascalSlug(p))
    .filter(Boolean);

  const base = slugParts.length > 0 ? slugParts.join('_') : 'File';
  return `${base}_${index}_${dateLabel}.${ext}`;
}

/**
 * Format ngày ngắn kiểu VN cho tên file: "d-m-yy" (KHÔNG zero-pad, VD ngày
 * 8 tháng 9 năm 2026 -> "8-9-26"). Chỉ dùng cho tên file (đã có `createdAt`
 * thật trong DB để hiển thị chính xác ở UI) - đây chỉ là gợi nhớ khi liệt kê
 * key thô trong trang Dọn dẹp Media.
 */
export function formatShortDateVN(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const yy = date.getFullYear() % 100;
  return `${d}-${m}-${yy}`;
}