import { DateRangeInput, vnRangeToUtcBounds } from './date-ranges.util';

/**
 * PLAN_RETENTION Phase 2 - đếm/xoá theo từng khoảng ngày, dùng chung cho `audit_logs` và
 * `periodic_task_audit_logs`. Xoá theo lô `DELETE ... LIMIT` (không bọc transaction dài), mỗi khoảng độc lập
 * và idempotent: hết ngân sách thời gian (serverless) thì dừng, trả `partial=true` để người dùng bấm xoá lại.
 */
export const RANGE_CLEANUP_BATCH_SIZE = 5000;
export const RANGE_CLEANUP_TIME_BUDGET_MS = 8000;

export type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown>;

export interface RangeCleanupOptions {
  query: QueryFn;
  table: 'audit_logs' | 'periodic_task_audit_logs';
  ranges: DateRangeInput[];
  /** Action KHÔNG được đụng tới (chỉ áp cho `audit_logs`). Rỗng/không có = xoá hết. */
  excludeActions?: string[];
  dryRun: boolean;
  budgetMs?: number;
}

export interface RangeCleanupResult {
  perRange: Array<DateRangeInput & { count: number }>;
  total: number;
  partial: boolean;
}

function whereFor(range: DateRangeInput, excludeActions: string[] = []) {
  const { fromUtc, toUtc } = vnRangeToUtcBounds(range);
  let where = 'created_at >= ? AND created_at < ?';
  const params: unknown[] = [fromUtc, toUtc];
  if (excludeActions.length > 0) {
    where += ` AND action NOT IN (${excludeActions.map(() => '?').join(',')})`;
    params.push(...excludeActions);
  }
  return { where, params };
}

/** Số dòng thuộc nhóm `actions` trong từng khoảng (dùng cho bản xem trước "sự kiện bảo mật"). */
export async function countActionsInRanges(
  query: QueryFn,
  ranges: DateRangeInput[],
  actions: string[],
): Promise<number> {
  if (actions.length === 0) return 0;
  let total = 0;
  for (const r of ranges) {
    const { fromUtc, toUtc } = vnRangeToUtcBounds(r);
    const rows = (await query(
      `SELECT COUNT(*) AS c FROM \`audit_logs\` WHERE created_at >= ? AND created_at < ? AND action IN (${actions.map(() => '?').join(',')})`,
      [fromUtc, toUtc, ...actions],
    )) as Array<{ c: string | number }>;
    total += Number(rows?.[0]?.c ?? 0);
  }
  return total;
}

export async function runRangeCleanup(opts: RangeCleanupOptions): Promise<RangeCleanupResult> {
  const { query, table, ranges, excludeActions, dryRun } = opts;
  const budget = opts.budgetMs ?? RANGE_CLEANUP_TIME_BUDGET_MS;
  const startedAt = Date.now();
  const perRange: RangeCleanupResult['perRange'] = [];
  let partial = false;

  for (const range of ranges) {
    const { where, params } = whereFor(range, excludeActions);
    let count = 0;

    if (dryRun) {
      const rows = (await query(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE ${where}`, params)) as Array<{ c: string | number }>;
      count = Number(rows?.[0]?.c ?? 0);
    } else if (partial) {
      // Đã hết ngân sách ở khoảng trước: bỏ qua phần còn lại, lần chạy sau làm tiếp.
      count = 0;
    } else {
      for (;;) {
        const res = (await query(
          `DELETE FROM \`${table}\` WHERE ${where} LIMIT ${RANGE_CLEANUP_BATCH_SIZE}`,
          params,
        )) as { affectedRows?: number };
        const n = Number(res?.affectedRows ?? 0);
        count += n;
        if (n < RANGE_CLEANUP_BATCH_SIZE) break;
        if (Date.now() - startedAt >= budget) {
          partial = true;
          break;
        }
      }
    }
    perRange.push({ ...range, count });
  }

  return { perRange, total: perRange.reduce((s, r) => s + r.count, 0), partial };
}
