import { BadRequestException } from '@nestjs/common';
import { todayVnStr } from '../../../common/utils/date-vn.util';
import { getWeekStartOfDateString } from '../../../common/utils/week-window.util';

/**
 * Khoảng thời gian BẮT BUỘC của `GET /periodic-tasks` - danh sách Công việc
 * TUYỆT ĐỐI KHÔNG BAO GIỜ tải toàn bộ bảng (yêu cầu chủ dự án: để khi số Task
 * tăng vẫn không chậm). Quy tắc:
 *  - Không truyền dateFrom/dateTo (và không có `periodStartDate` khớp chính xác
 *    1 kỳ) -> mặc định TUẦN NÀY (Thứ 2 -> Chủ nhật, giờ VN).
 *  - Chỉ truyền 1 biên -> biên còn lại tự bù +/- 6 ngày (cửa sổ 7 ngày).
 *  - Truyền đủ 2 biên -> tối đa `MAX_LIST_RANGE_DAYS` ngày, dateFrom <= dateTo.
 * Lọc kiểu GIAO khoảng (period_end_date >= from AND period_start_date <= to) nên
 * Task Tháng/Năm bao trùm khoảng đó vẫn hiện ra.
 */
export const MAX_LIST_RANGE_DAYS = 93;

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcMs = (s: string): number => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();

export function addDaysToDateString(dateStr: string, days: number): string {
  return new Date(toUtcMs(dateStr) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface ListWindow {
  /** null = KHÔNG áp khoảng (chỉ khi lọc chính xác `periodStartDate`). */
  dateFrom: string | null;
  dateTo: string | null;
  /** true = người gọi không truyền khoảng nào -> đã tự đặt Tuần này. */
  defaulted: boolean;
}

export function resolveListWindow(
  input: { periodStartDate?: string; dateFrom?: string; dateTo?: string },
  today: string = todayVnStr(),
): ListWindow {
  const from = input.dateFrom?.slice(0, 10);
  const to = input.dateTo?.slice(0, 10);

  for (const v of [from, to]) {
    if (v && Number.isNaN(toUtcMs(v))) {
      throw new BadRequestException('dateFrom/dateTo không phải ngày hợp lệ (YYYY-MM-DD)');
    }
  }

  if (!from && !to) {
    // Khớp CHÍNH XÁC 1 kỳ đã là truy vấn hẹp, không cần thêm khoảng.
    if (input.periodStartDate) return { dateFrom: null, dateTo: null, defaulted: false };
    const monday = getWeekStartOfDateString(today);
    return { dateFrom: monday, dateTo: addDaysToDateString(monday, 6), defaulted: true };
  }

  const resolvedFrom = from ?? addDaysToDateString(to as string, -6);
  const resolvedTo = to ?? addDaysToDateString(from as string, 6);

  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('dateFrom không được lớn hơn dateTo');
  }
  const spanDays = Math.round((toUtcMs(resolvedTo) - toUtcMs(resolvedFrom)) / DAY_MS) + 1;
  if (spanDays > MAX_LIST_RANGE_DAYS) {
    throw new BadRequestException(`Khoảng thời gian tối đa ${MAX_LIST_RANGE_DAYS} ngày - vui lòng thu hẹp bộ lọc ngày`);
  }
  return { dateFrom: resolvedFrom, dateTo: resolvedTo, defaulted: false };
}
