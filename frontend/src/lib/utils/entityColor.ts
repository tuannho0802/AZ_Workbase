/**
 * Màu mặc định dùng khi 1 entity (Role/Position/Department/AssignmentGroupConfig)
 * chưa có `color` (không nên xảy ra - BE cột NOT NULL DEFAULT '#1890ff', xem
 * migration AddColorToRbacGroupingTables1781300000000 - đây CHỈ là fallback an
 * toàn cho dữ liệu tham chiếu không đầy đủ, vd object rút gọn từ API cũ).
 *
 * ⚠️ Đây KHÔNG phải "hardcode màu" theo đúng nghĩa bị cấm (1 màu áp cho MỌI
 * dòng dữ liệu) - đây là fallback DUY NHẤT khi thiếu dữ liệu, mọi nơi hiển
 * thị Tag PHẢI ưu tiên đọc `color` thật của record trước (xem `resolveEntityColor`).
 */
export const DEFAULT_ENTITY_COLOR = '#1890ff';

/** Đọc màu thật của 1 entity (Role/Position/Department/AssignmentGroupConfig),
 * fallback về DEFAULT_ENTITY_COLOR CHỈ khi thiếu dữ liệu. */
export function resolveEntityColor(color?: string | null): string {
  return color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_ENTITY_COLOR;
}
