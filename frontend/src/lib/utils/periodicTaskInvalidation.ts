/**
 * Quyết định query nào trong namespace `'periodic-tasks'` CẦN refetch sau khi 1 mục checklist của
 * Task `taskId` đổi (thêm/sửa/tick/xoá/di chuyển).
 *
 * [PERF/Fluid CPU] Trước đây mỗi lần tick invalidate CẢ namespace -> mọi query đang mở bị gọi lại
 * (danh sách, `links-among`, `linked-children-page`, `checklist-page`...). BE vẫn chạy trọn query rồi
 * mới trả 304, nên chỉ tiết kiệm băng thông chứ không tiết kiệm CPU.
 *
 * Bỏ qua (an toàn, vì tick checklist KHÔNG đổi dữ liệu này):
 *  - `links-among` / `children` / `parents`: cấu trúc liên kết cha-con (chỉ đổi khi thêm/gỡ liên kết).
 *  - `linked-children-page` CỦA CHÍNH `taskId`: là danh sách Task CON của nó - tick mục của nó không đổi
 *    dữ liệu Task con. (Trang Task con của Task CHA khác vẫn được làm mới vì hiển thị tiến độ của nó.)
 *
 * Mọi query khác (danh sách, detail, checklist-page, rollup, ...) vẫn refetch như cũ.
 */
export function shouldRefetchAfterChecklistChange(queryKey: readonly unknown[], taskId: number): boolean {
  const segment = queryKey[1];
  if (segment === 'links-among' || segment === 'children' || segment === 'parents') return false;
  if (segment === 'linked-children-page' && queryKey[2] === taskId) return false;
  return true;
}
