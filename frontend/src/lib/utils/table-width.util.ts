/**
 * Tổng độ rộng (px) của các cột đã khai báo `width` dạng số - dùng làm `scroll.x` của AntD Table để
 * `scroll.x` LUÔN >= tổng cột (không bao giờ lệch tay).
 *
 * Bug thật đã gặp (trang Quản lý UTM): `scroll.x` gõ tay (1400) NHỎ HƠN tổng các cột khác (1490) mà cột
 * "UTM" lại không khai báo width -> ở `table-layout: fixed` (AntD tự bật khi có cột `ellipsis`) cột đó bị
 * nén về ~0px, Tag tràn đè lên cột "Mô tả" bên cạnh. Cột không có width (hoặc width chuỗi) được tính
 * bằng `fallback` để vẫn chừa chỗ.
 */
export function sumColumnWidths(columns: ReadonlyArray<{ width?: number | string }>, fallback = 160): number {
  return columns.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : fallback), 0);
}
