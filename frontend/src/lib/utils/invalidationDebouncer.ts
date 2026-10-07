/**
 * [9B-2] Gộp (debounce TRAILING) các lần invalidate "phụ" khi người dùng thêm checklist liên tiếp: N lần trong cửa sổ
 * `delayMs` chỉ chạy 1 lần (hàm MỚI NHẤT) sau lần cuối. `maxWaitMs` là trần chờ tính từ lần đầu của đợt - thêm liên tục
 * không bao giờ bị trì hoãn vô hạn.
 *
 * KHÔNG dùng cho query người dùng đang nhìn ngay (trang checklist của chính task): phải refetch tức thì để item mới hiện.
 */
export interface InvalidationDebouncer {
  schedule: (key: string | number, fn: () => void) => void;
  /** Chạy ngay các việc đang chờ (dùng khi cần chốt dữ liệu, vd trước khi rời trang / trong test). */
  flush: () => void;
  /** Số khoá đang chờ - để test. */
  pending: () => number;
}

export function createInvalidationDebouncer(delayMs: number, maxWaitMs: number): InvalidationDebouncer {
  const entries = new Map<string | number, { timer: ReturnType<typeof setTimeout>; first: number; fn: () => void }>();

  const run = (key: string | number) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    entry.fn();
  };

  return {
    schedule(key, fn) {
      const now = Date.now();
      const prev = entries.get(key);
      const first = prev?.first ?? now;
      if (prev) clearTimeout(prev.timer);
      const wait = Math.max(0, Math.min(delayMs, maxWaitMs - (now - first)));
      entries.set(key, { timer: setTimeout(() => run(key), wait), first, fn });
    },
    flush() {
      for (const [key, entry] of [...entries]) {
        clearTimeout(entry.timer);
        run(key);
      }
    },
    pending: () => entries.size,
  };
}
