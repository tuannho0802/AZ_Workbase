import { BadRequestException } from '@nestjs/common';
import { todayVnStr } from './date-vn.util';

/**
 * PLAN_RETENTION Phase 2 (A2) - chuẩn hoá danh sách khoảng ngày để xoá audit.
 * Mọi ngày là chuỗi `YYYY-MM-DD` theo GIỜ VN (đúng ngày người dùng chọn trên date-picker).
 */
export interface DateRangeInput {
  from: string;
  to: string;
}

export interface NormalizedDateRanges {
  /** Đã cắt `to` về hôm qua (VN), loại khoảng rỗng, gộp chồng lấn/liền kề, sắp theo `from`. */
  ranges: DateRangeInput[];
  /** Khoảng bị loại hoàn toàn vì nằm trọn trong hôm nay/tương lai (để báo lại cho người dùng). */
  dropped: DateRangeInput[];
}

export const MAX_CLEANUP_RANGES = 20;
export const MAX_CLEANUP_RANGE_DAYS = 366;
/** VN = UTC+7, không có DST. Cùng quy ước `VN_OFFSET_MS` của `report-range.util.ts`. */
const VN_OFFSET_HOURS = 7;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(s: string): number {
  if (typeof s !== 'string' || !DATE_RE.test(s)) {
    throw new BadRequestException(`Ngày không hợp lệ (cần YYYY-MM-DD): ${String(s)}`);
  }
  const [y, m, d] = s.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  // Chặn ngày không có thật (VD 2026-02-31 bị Date tự đẩy sang tháng sau).
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    throw new BadRequestException(`Ngày không tồn tại: ${s}`);
  }
  return ms;
}

function fmtDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Cộng `n` ngày vào chuỗi `YYYY-MM-DD` (tính theo UTC, không phụ thuộc timezone máy chủ). */
export function addDaysStr(day: string, n: number): string {
  return fmtDay(parseDay(day) + n * DAY_MS);
}

export function normalizeDateRanges(
  input: DateRangeInput[],
  today: string = todayVnStr(),
): NormalizedDateRanges {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BadRequestException('Cần ít nhất 1 khoảng ngày');
  }
  if (input.length > MAX_CLEANUP_RANGES) {
    throw new BadRequestException(`Tối đa ${MAX_CLEANUP_RANGES} khoảng ngày mỗi lần`);
  }

  const yesterdayMs = parseDay(today) - DAY_MS;
  const kept: Array<[number, number]> = [];
  const dropped: DateRangeInput[] = [];

  for (const r of input) {
    const f = parseDay(r.from);
    const t = parseDay(r.to);
    if (f > t) {
      throw new BadRequestException(`Khoảng ngày ngược: ${r.from} > ${r.to}`);
    }
    if ((t - f) / DAY_MS + 1 > MAX_CLEANUP_RANGE_DAYS) {
      throw new BadRequestException(`Mỗi khoảng tối đa ${MAX_CLEANUP_RANGE_DAYS} ngày: ${r.from} → ${r.to}`);
    }
    // Không xoá hôm nay/tương lai - để không xoá mất dấu vết của chính lần xoá này.
    const clippedTo = Math.min(t, yesterdayMs);
    if (f > clippedTo) {
      dropped.push({ from: r.from, to: r.to });
      continue;
    }
    kept.push([f, clippedTo]);
  }

  kept.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const cur of kept) {
    const last = merged[merged.length - 1];
    // Gộp khi chồng lấn HOẶC liền kề (cur.from <= last.to + 1 ngày).
    if (last && cur[0] <= last[1] + DAY_MS) last[1] = Math.max(last[1], cur[1]);
    else merged.push([cur[0], cur[1]]);
  }

  return { ranges: merged.map(([f, t]) => ({ from: fmtDay(f), to: fmtDay(t) })), dropped };
}

/**
 * Đổi 1 khoảng ngày VN (inclusive) thành cận [fromUtc, toUtcExclusive) dạng `YYYY-MM-DD HH:mm:ss` UTC.
 * `created_at` do DB tự sinh theo session timezone = UTC (xem `reports.service.ts` - `fromUtc`/`toUtc`),
 * nên so sánh thẳng chuỗi ngày thô sẽ lệch 7 tiếng so với "ngày VN" người dùng chọn.
 */
export function vnRangeToUtcBounds(r: DateRangeInput): { fromUtc: string; toUtc: string } {
  const f = parseDay(r.from) - VN_OFFSET_HOURS * 3_600_000;
  const t = parseDay(r.to) + DAY_MS - VN_OFFSET_HOURS * 3_600_000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  return { fromUtc: fmt(f), toUtc: fmt(t) };
}
