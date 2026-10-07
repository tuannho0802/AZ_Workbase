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
 *  - `rollup` CỦA CHÍNH `taskId` [9B-0]: BE `getRollup()` chỉ đếm TRẠNG THÁI các Task CON (JOIN
 *    periodic_task_links -> con -> status), KHÔNG đọc checklist của task => đổi checklist của `taskId` không
 *    làm đổi rollup của nó. (Rollup của Task CHA - id khác - vẫn refetch vì status của `taskId` có thể đổi
 *    khi BE mở lại/hoàn thành task trong cùng request.)
 *
 * Mọi query khác (danh sách, detail, checklist-page, rollup của task khác, ...) vẫn refetch như cũ.
 */
export function shouldRefetchAfterChecklistChange(queryKey: readonly unknown[], taskId: number): boolean {
  const segment = queryKey[1];
  if (segment === 'links-among' || segment === 'children' || segment === 'parents') return false;
  if (segment === 'linked-children-page' && queryKey[2] === taskId) return false;
  // [AGENT] OLD CODE (9B-0, giữ lại để rollback): rollup luôn refetch (không có dòng bên dưới)
  if (segment === 'rollup' && queryKey[2] === taskId) return false;
  return true;
}

/**
 * [9B-1] Query DANH SÁCH Task: key `['periodic-tasks', params]` với `params` là object (khác mọi query con có
 * segment thứ 2 là chuỗi: 'detail' | 'checklist-page' | 'rollup' | ...). Dùng để chọn các query được ghi thẳng
 * nhãn "X/Z" từ response BE thay vì refetch cả danh sách (limit 100 - phần nặng nhất của chuỗi refetch).
 */
export function isPeriodicTaskListKey(queryKey: readonly unknown[]): boolean {
  const segment = queryKey[1];
  return queryKey[0] === 'periodic-tasks' && typeof segment === 'object' && segment !== null && !Array.isArray(segment);
}

/**
 * Ghi `checklistProgress` mới (số liệu LẤY TỪ BE, không tự cộng trừ) vào đúng dòng Task trong 1 trang danh sách đã
 * cache. Trả về CHÍNH `old` (cùng tham chiếu) nếu không có dòng nào khớp -> không kích hoạt render thừa.
 */
export function patchTaskChecklistProgress<T>(
  old: T,
  taskId: number,
  progress: { done: number; total: number },
): T {
  const patchRows = (rows: unknown[]) =>
    rows.map((r) => ((r as { id?: number }).id === taskId ? { ...(r as object), checklistProgress: progress } : r));
  const hasRow = (rows: unknown) => Array.isArray(rows) && rows.some((r) => (r as { id?: number })?.id === taskId);

  // Dạng `useInfiniteQuery` (Agenda/Kanban/Calendar tải dần): { pages: [{ data: [...] }, ...], pageParams }.
  const pages = (old as { pages?: unknown } | undefined)?.pages;
  if (Array.isArray(pages)) {
    if (!pages.some((p) => hasRow((p as { data?: unknown } | undefined)?.data))) return old;
    return {
      ...(old as object),
      pages: pages.map((p) => {
        const rows = (p as { data?: unknown } | undefined)?.data;
        return hasRow(rows) ? { ...(p as object), data: patchRows(rows as unknown[]) } : p;
      }),
    } as T;
  }

  // Dạng `useQuery` thường (Bảng phân trang): { data: [...] }.
  const rows = (old as { data?: unknown } | undefined)?.data;
  if (!hasRow(rows)) return old;
  return { ...(old as object), data: patchRows(rows as unknown[]) } as T;
}
