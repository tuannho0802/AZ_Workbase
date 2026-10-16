import type { HealthCronWarnReason } from '@/lib/api/system.api';

/** 93784 -> "1 ngày 2 giờ"; < 1 phút -> "dưới 1 phút". Chỉ lấy 2 đơn vị lớn nhất cho gọn. */
export function formatDurationVi(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d} ngày`);
  if (h) parts.push(`${h} giờ`);
  if (m && parts.length < 2) parts.push(`${m} phút`);
  return parts.length ? parts.slice(0, 2).join(' ') : 'dưới 1 phút';
}

export const CRON_WARN_LABEL: Record<HealthCronWarnReason, string> = {
  NEVER_RAN: 'Chưa từng chạy lần nào',
  OVERDUE: 'Quá hạn: đã lâu hơn chu kỳ + 2 ngày mà chưa chạy lại',
  LAST_RUN_INCOMPLETE: 'Lần chạy gần nhất chưa hoàn tất (partial/failed) — sẽ làm tiếp ở lần kích hoạt kế tiếp',
};

export const CRON_STATUS_LABEL: Record<string, string> = {
  success: 'Thành công',
  partial: 'Chưa xong (làm tiếp)',
  failed: 'Lỗi',
  running: 'Đang chạy',
};

/** Số dòng ước lượng (information_schema) -> "~1,2 triệu" / "~350 nghìn" / "~800". */
export function formatRowsEstimate(n: number): string {
  if (n >= 1_000_000) return `~${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  if (n >= 1_000) return `~${Math.round(n / 1_000).toLocaleString('vi-VN')} nghìn`;
  return `~${n.toLocaleString('vi-VN')}`;
}
