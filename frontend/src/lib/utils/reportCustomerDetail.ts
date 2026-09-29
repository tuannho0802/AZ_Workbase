import dayjs, { type Dayjs } from 'dayjs';
import {
  getLastWeekRange,
  getThisMonthRange,
  getThisWeekRange,
  getTodayRange,
  type DateRangeTuple,
} from './periodicTaskRange';
import type { ReportCustomerDetail, ReportDepositStage } from '../types/reports.types';

/** Lọc nhanh theo ngày dùng chung cho Mini Table khách + modal chi tiết khách của trang Báo cáo. */
export type QuickRangeKey = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth';

export const QUICK_RANGE_OPTIONS: { key: QuickRangeKey; label: string; getRange: (now?: Dayjs) => DateRangeTuple }[] = [
  { key: 'today', label: 'Hôm nay', getRange: getTodayRange },
  { key: 'thisWeek', label: 'Tuần này', getRange: getThisWeekRange },
  { key: 'lastWeek', label: 'Tuần trước', getRange: getLastWeekRange },
  { key: 'thisMonth', label: 'Tháng này', getRange: getThisMonthRange },
];

/** Khoảng đang chọn trùng ĐÚNG (theo ngày) preset nào? null nếu là khoảng tự chọn / chưa chọn. */
export function matchQuickRange(
  range: [Dayjs | null, Dayjs | null] | null | undefined,
  now: Dayjs = dayjs(),
): QuickRangeKey | null {
  if (!range?.[0] || !range?.[1]) return null;
  for (const o of QUICK_RANGE_OPTIONS) {
    const [from, to] = o.getRange(now);
    if (range[0].isSame(from, 'day') && range[1].isSame(to, 'day')) return o.key;
  }
  return null;
}

/** Giữ các khoản nạp có `depositDate` (YYYY-MM-DD) nằm trong [from, to] (gồm 2 đầu, so theo ngày). Không có range = giữ hết. */
export function filterDepositsByRange(
  deposits: ReportDepositStage[],
  range: [Dayjs | null, Dayjs | null] | null | undefined,
): ReportDepositStage[] {
  if (!range?.[0] || !range?.[1]) return deposits;
  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  return deposits.filter((d) => d.depositDate >= from && d.depositDate <= to);
}

export const DEPOSIT_STAGE_LABEL = (d: Pick<ReportDepositStage, 'stage' | 'order'>): string =>
  d.stage === 'ftd' ? 'Nạp lần đầu (FTD)' : `Nạp lại lần ${d.order - 1}`;

export interface TimelineEvent {
  key: string;
  /** 'YYYY-MM-DD' - dùng để sắp xếp. */
  date: string;
  kind: 'created' | 'assigned' | 'joined' | 'closed' | 'ftd' | 'redeposit';
  title: string;
  detail?: string;
}

const day = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 10) : null);

/**
 * Dòng thời gian của 1 khách: nhập data -> gán Sales -> join nhóm -> chốt -> các lần nạp, sắp theo ngày (ổn định:
 * cùng ngày giữ đúng thứ tự vòng đời). `createdAt` là UTC nên KHÔNG dùng làm mốc - lấy `inputDate` (ngày nhập do người dùng chọn).
 */
export function buildCustomerTimeline(detail: ReportCustomerDetail): TimelineEvent[] {
  const { customer, deposits, groups } = detail;
  const events: (TimelineEvent & { rank: number })[] = [];
  const push = (e: Omit<TimelineEvent, 'date'> & { date: string | null; rank: number }) => {
    if (e.date) events.push({ ...e, date: e.date });
  };

  push({ key: 'created', date: day(customer.inputDate) ?? day(customer.createdAt), kind: 'created', title: 'Nhập data', rank: 0 });
  push({
    key: 'assigned',
    date: day(customer.assignedDate),
    kind: 'assigned',
    title: 'Gán Sales phụ trách',
    detail: customer.salesUser?.name,
    rank: 1,
  });
  groups.forEach((g) =>
    push({ key: `group-${g.id}`, date: day(g.joinedAt), kind: 'joined', title: 'Join nhóm', detail: g.name, rank: 2 }),
  );
  push({ key: 'closed', date: day(customer.closedDate), kind: 'closed', title: 'Chốt khách', rank: 3 });
  deposits.forEach((d) =>
    push({
      key: `dep-${d.id}`,
      date: d.depositDate,
      kind: d.stage,
      title: DEPOSIT_STAGE_LABEL(d),
      detail: `$${d.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      rank: 4,
    }),
  );

  return events
    .sort((a, b) => (a.date === b.date ? a.rank - b.rank : a.date < b.date ? -1 : 1))
    .map((e) => ({ key: e.key, date: e.date, kind: e.kind, title: e.title, detail: e.detail }));
}
