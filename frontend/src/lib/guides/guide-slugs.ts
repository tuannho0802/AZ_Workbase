/**
 * Bản đồ TRANG <-> BÀI HƯỚNG DẪN (PLAN_GUIDES_CONTENT §2.5). Nguồn duy nhất cho:
 *  - nút "Xem hướng dẫn trang này" ở Header dashboard,
 *  - test lưới an toàn `nav-guide-coverage.test.ts` (mỗi mục menu phải có file `guides-content/<slug>.md`).
 *
 * Thêm trang mới vào `NAV_ITEMS` -> PHẢI thêm 1 dòng ở đây (test đỏ nếu quên) + viết `guides-content/<slug>.md`.
 */
export const GUIDES_BASE_PATH = '/huong-dan';

/** Bài tổng (cách dùng menu, Ctrl+K, vai trò & phạm vi xem) - gắn với Trang chủ. */
export const GETTING_STARTED_GUIDE_SLUG = 'bat-dau';
export const HOME_NAV_KEY = 'home';

/** `NAV_ITEMS[].key` -> slug bài hướng dẫn của trang đó. */
export const GUIDE_SLUG_BY_NAV_KEY: Readonly<Record<string, string>> = {
  customers: 'khach-hang',
  'chia-data': 'chia-data',
  'cong-viec-dinh-ky': 'cong-viec-dinh-ky',
  'lich-su-cong-viec': 'lich-su-cong-viec',
  'hieu-suat-cong-viec': 'hieu-suat-cong-viec',
  'nghi-phep': 'nghi-phep',
  'thong-bao': 'thong-bao',
  'thong-bao-gui': 'gui-thong-bao',
  'thong-bao-da-gui': 'thong-bao-da-gui',
  'huong-dan': 'huong-dan-su-dung',
  profile: 'profile',
  'nhom-toi-quan-ly': 'nhom-toi-quan-ly',
  reports: 'bao-cao-doanh-so',
  'duyet-phep': 'duyet-phep',
  'audit-logs': 'nhat-ky-he-thong',
  users: 'nhan-vien',
  'phong-ban': 'phong-ban',
  'vi-tri': 'vi-tri',
  'quan-ly-phu-trach': 'quan-ly-phu-trach',
  'quan-ly-loai-phep': 'loai-phep',
  'quan-ly-status-khach': 'status-khach',
  'quan-ly-trang-thai-cong-viec': 'trang-thai-cong-viec',
  'trash-can': 'thung-rac',
  'nguon-media': 'nguon-media',
  'nhom-lien-ket': 'nhom-lien-ket',
  'quan-ly-utm': 'quan-ly-utm',
  'attendance-device': 'may-cham-cong',
  'invalid-data-report': 'bao-cao-data-loi',
  'phan-quyen': 'phan-quyen',
  'storage-img': 'luu-tru-anh',
};

/** Mọi slug bài bắt buộc phải có (30 trang + bài tổng). */
export const REQUIRED_GUIDE_SLUGS: readonly string[] = [...Object.values(GUIDE_SLUG_BY_NAV_KEY), GETTING_STARTED_GUIDE_SLUG];

/**
 * Bài KHÔNG gắn với trang nào trong menu nhưng có thật và được bài khác liên kết tới (vd bài hướng dẫn soạn bài).
 * Tách khỏi `REQUIRED_GUIDE_SLUGS` vì test `nav-guide-coverage` đòi đúng "số trang + 1" - chỉ dùng cho kiểm tra liên kết nội bộ.
 */
export const STANDALONE_GUIDE_SLUGS: readonly string[] = ['huong-dan-soan-bai'];

/**
 * DANH SÁCH "CHƯA VIẾT" - cơ chế bánh cóc (ratchet) cho test `nav-guide-coverage`:
 *  - slug bắt buộc mà CHƯA có file `guides-content/<slug>.md` thì phải nằm ở đây (để test không đỏ oan trong lúc đang viết dần P1-P4);
 *  - khi viết xong 1 bài, PHẢI xoá slug đó khỏi đây (test đỏ nếu bài đã có file mà vẫn còn trong danh sách) -> danh sách chỉ co lại;
 *  - trang MỚI thêm vào NAV_ITEMS mà không có bài và không được liệt kê ở đây -> test đỏ.
 * Mục tiêu cuối (P5): mảng rỗng.
 */
export const PENDING_GUIDE_SLUGS: readonly string[] = [
  'lich-su-cong-viec',
  'hieu-suat-cong-viec',
  'nghi-phep',
  'thong-bao',
  'gui-thong-bao',
  'thong-bao-da-gui',
  'profile',
  'bao-cao-doanh-so',
  'duyet-phep',
  'nhat-ky-he-thong',
  'nhan-vien',
  'phong-ban',
  'vi-tri',
  'loai-phep',
  'may-cham-cong',
  'phan-quyen',
  'luu-tru-anh',
];

export function guideSlugForNavKey(navKey: string): string | null {
  if (navKey === HOME_NAV_KEY) return GETTING_STARTED_GUIDE_SLUG;
  return GUIDE_SLUG_BY_NAV_KEY[navKey] ?? null;
}

/**
 * Slug bài cần gợi ý cho nút "Xem hướng dẫn trang này", hoặc null = ẩn nút:
 *  - trang không có bài ánh xạ;
 *  - người xem KHÔNG được xem bài đó (BE chỉ trả mục lục guide đã xuất bản + đúng role/vị trí/phòng ban/quyền -> `visibleSlugs`);
 *  - đang đứng chính ở bài đó rồi (tránh nút tự trỏ về mình).
 */
export function resolvePageGuideSlug(navKey: string, visibleSlugs: readonly string[], pathname: string): string | null {
  const slug = guideSlugForNavKey(navKey);
  if (!slug || !visibleSlugs.includes(slug)) return null;
  const here = `${GUIDES_BASE_PATH}/${slug}`;
  if (pathname === here || pathname === `${here}/`) return null;
  return slug;
}
