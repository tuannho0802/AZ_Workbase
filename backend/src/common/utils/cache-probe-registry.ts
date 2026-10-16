/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 8 (Sức khoẻ hệ thống).
 * Mỗi cache bộ nhớ trong code tự đăng ký 1 "probe" (tên, TTL, hàm đếm số mục) để trang Sức khoẻ hệ thống liệt kê
 * ĐÚNG những cache thực sự có, không phải danh sách gõ tay dễ lệch. Chỉ ĐỌC số mục, không đụng nội dung cache
 * (không lộ dữ liệu người dùng).
 *
 * Lưu ý: serverless -> mỗi instance có cache riêng; số liệu chỉ phản ánh instance đang trả lời request.
 */
export interface CacheProbe {
  key: string;
  label: string;
  ttlSeconds: number;
  /** Số mục đang nằm trong cache (kể cả mục đã hết hạn nhưng chưa bị dọn). */
  size: () => number;
}

export interface CacheProbeSnapshot {
  key: string;
  label: string;
  ttlSeconds: number;
  entries: number | null;
}

const probes = new Map<string, CacheProbe>();

/** Đăng ký (hoặc ghi đè cùng `key`). Trả về `key` để dùng được làm initializer của field. */
export function registerCacheProbe(probe: CacheProbe): string {
  probes.set(probe.key, probe);
  return probe.key;
}

/** Ảnh chụp hiện tại. Probe lỗi -> `entries: null` (không làm hỏng cả trang). */
export function snapshotCacheProbes(): CacheProbeSnapshot[] {
  return [...probes.values()]
    .map((p) => {
      let entries: number | null = null;
      try {
        const n = p.size();
        entries = Number.isFinite(n) ? n : null;
      } catch {
        entries = null;
      }
      return { key: p.key, label: p.label, ttlSeconds: p.ttlSeconds, entries };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Chỉ dùng trong test. */
export function clearCacheProbesForTest(): void {
  probes.clear();
}
