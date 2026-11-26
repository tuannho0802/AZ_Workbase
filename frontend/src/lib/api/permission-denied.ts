/**
 * 403 "thiếu quyền" trên request TẢI TRANG (GET) của 3 trang Quản lý: Nhóm tôi quản lý, Quản lý UTM, Quản lý Fanpage.
 *
 * Bối cảnh: Admin tắt quyền (Toàn cục / Phòng ban / Vị trí) -> BE từ chối ngay, nhưng FE còn giữ bản quyền cũ
 * (cache `my-permissions`, cập nhật theo nhịp poll) nên Sidebar vẫn hiện mục và trang vẫn gọi API -> toast đỏ
 * "Bạn không có quyền thực hiện hành động này". Với request tải dữ liệu thụ động (GET) đây không phải lỗi người dùng
 * gây ra, nên KHÔNG toast; interceptor thay vào đó làm mới quyền để Sidebar/trang tự ẩn ngay.
 * Hành động chủ động (POST/PUT/PATCH/DELETE) vẫn toast như cũ.
 */
const MANAGER_PAGE_API_PREFIXES = ['/link-groups', '/link-categories', '/utms', '/fanpages', '/fanpage-'] as const;

/** Lấy phần đường dẫn (bỏ baseURL, query) từ `config.url` (có thể là URL đầy đủ hoặc đường dẫn tương đối). */
export function apiPathOf(url: string | undefined): string {
  if (!url) return '';
  let path = url;
  const m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(url);
  if (m) path = m[1] ?? '/';
  path = path.split('?')[0];
  return path.replace(/^\/api(?=\/)/, '');
}

/** true = 403 trên GET thuộc 3 trang Quản lý -> không toast (xem JSDoc đầu file). */
export function isSilentPermissionDenied(status: number | undefined, method: string | undefined, url: string | undefined): boolean {
  if (status !== 403) return false;
  if ((method ?? 'get').toLowerCase() !== 'get') return false;
  const path = apiPathOf(url);
  // Tiền tố kết thúc bằng '-' (vd '/fanpage-') khớp theo chuỗi; còn lại khớp đúng đoạn đường dẫn ('/utms' không khớp '/utmsx').
  return MANAGER_PAGE_API_PREFIXES.some((p) => (p.endsWith('-') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}
