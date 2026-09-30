export interface BulkResultLike {
  succeeded: number[];
  failed: Array<{ id: number; reason: string }>;
}

export type BulkLevel = 'success' | 'warning' | 'error';

/**
 * Tóm tắt kết quả hàng loạt cho toast/modal: `verb` = "khoá", "xoá", "gỡ UTM"... `nameOf` đổi ID -> tên hiển thị
 * (không có thì dùng #ID); `unit` = đơn vị đếm (mặc định "mục"). Tất cả thành công -> success; lẫn lộn -> warning; tất cả lỗi -> error.
 */
export function summarizeBulkResult(
  result: BulkResultLike,
  verb: string,
  nameOf: (id: number) => string | undefined = () => undefined,
  unit = 'mục',
): { level: BulkLevel; text: string; failures: Array<{ id: number; name: string; reason: string }> } {
  const ok = result.succeeded.length;
  const bad = result.failed.length;
  const failures = result.failed.map((f) => ({ id: f.id, name: nameOf(f.id) ?? `#${f.id}`, reason: f.reason }));
  if (bad === 0) return { level: 'success', text: `Đã ${verb} ${ok} ${unit}`, failures };
  if (ok === 0) return { level: 'error', text: `Không ${verb} được ${unit} nào (${bad} lỗi)`, failures };
  return { level: 'warning', text: `Đã ${verb} ${ok} ${unit}, ${bad} ${unit} lỗi`, failures };
}

/** Bỏ khỏi tập đã chọn những ID không còn trong danh sách (vừa xoá/khoá/đổi trang lọc). */
export function pruneSelection(selected: number[], visibleIds: number[]): number[] {
  const set = new Set(visibleIds);
  const next = selected.filter((id) => set.has(id));
  return next.length === selected.length ? selected : next;
}
