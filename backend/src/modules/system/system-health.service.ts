import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RetentionService } from '../retention/retention.service';
import { snapshotCacheProbes, CacheProbeSnapshot } from '../../common/utils/cache-probe-registry';
import { countRefreshSessions } from '../../common/utils/refresh-session-store.util';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 8 (Sức khoẻ hệ thống, chỉ-đọc, chỉ Root Admin).
 * Mỗi phần chạy ĐỘC LẬP: 1 phần lỗi chỉ trả `{ error: true }` cho phần đó, không làm hỏng cả trang.
 * Thời gian "tuổi" của lần chạy cron luôn tính bằng đồng hồ DB (do RetentionService.getSchedule làm).
 */

/** Cache bảng (information_schema chậm hơn câu SQL thường) - 5 phút/instance, đúng plan. */
export const HEALTH_TABLES_CACHE_TTL_MS = 5 * 60_000;
/** Nút "Làm mới" bỏ qua cache bảng, nhưng không quá thường xuyên (chống bấm dồn). */
export const HEALTH_TABLES_FORCE_MIN_INTERVAL_MS = 30_000;

/** Bảng log hay phình -> ngưỡng cảnh báo thấp hơn. */
export const HEALTH_WATCHED_TABLES = [
  'audit_logs',
  'periodic_task_audit_logs',
  'notifications',
  'attendance_logs',
  'ip_access_logs',
] as const;
export const HEALTH_WATCHED_WARN_ROWS = 500_000;
export const HEALTH_WATCHED_WARN_BYTES = 256 * 1024 * 1024;
export const HEALTH_OTHER_WARN_ROWS = 2_000_000;
export const HEALTH_OTHER_WARN_BYTES = 1024 * 1024 * 1024;
/** Cron coi là "quá hạn" khi tuổi lần chạy thành công gần nhất > chu kỳ + số ngày này (plan: chu kỳ + 2 ngày). */
export const HEALTH_CRON_OVERDUE_GRACE_DAYS = 2;

export type HealthSection<T> = ({ error: false } & T) | { error: true };

export interface HealthTableItem {
  name: string;
  rowsEstimate: number;
  sizeBytes: number;
  watched: boolean;
  warn: boolean;
}

export interface SystemHealth {
  generatedAt: string;
  app: HealthSection<{
    version: string;
    commit: string | null;
    region: string | null;
    nodeEnv: string;
    nodeVersion: string;
    uptimeSeconds: number;
  }>;
  database: HealthSection<{ ok: boolean; pingMs: number; serverVersion: string | null }>;
  tables: HealthSection<{
    items: HealthTableItem[];
    totalBytes: number;
    warnCount: number;
    cachedAt: string;
    /** true = lấy từ cache 5 phút (không truy vấn lại information_schema). */
    fromCache: boolean;
  }>;
  cron: HealthSection<{
    job: string;
    intervalDays: number;
    lastRun: { status: string; affected: number; message: string | null; ageSeconds: number } | null;
    nextDueInSeconds: number;
    dueNow: boolean;
    /** Chưa từng chạy, hoặc quá hạn (chu kỳ + 2 ngày), hoặc lần gần nhất partial/failed. */
    warn: boolean;
    warnReason: 'NEVER_RAN' | 'OVERDUE' | 'LAST_RUN_INCOMPLETE' | null;
  }>;
  caches: HealthSection<{
    /** Cache nằm trong bộ nhớ từng instance serverless: số liệu chỉ của instance đang trả lời request này. */
    scope: 'current_instance';
    items: CacheProbeSnapshot[];
  }>;
  sessions: HealthSection<{ totalSessions: number; usersWithSessions: number }>;
  security: HealthSection<{ activeIpLocks: number; activeIpBans: number }>;
}

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);
  private tablesCache: { items: HealthTableItem[]; at: number } | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly retention: RetentionService,
  ) {}

  async getHealth(opts: { fresh?: boolean } = {}): Promise<SystemHealth> {
    const [app, database, tables, cron, caches, sessions, security] = await Promise.all([
      this.section('app', async () => this.app()),
      this.section('database', () => this.database()),
      this.section('tables', () => this.tables(opts.fresh === true)),
      this.section('cron', () => this.cron()),
      this.section('caches', async () => ({ scope: 'current_instance' as const, items: snapshotCacheProbes() })),
      this.section('sessions', () => this.sessions()),
      this.section('security', () => this.security()),
    ]);
    return { generatedAt: new Date().toISOString(), app, database, tables, cron, caches, sessions, security };
  }

  private async section<T>(name: string, fn: () => Promise<T>): Promise<HealthSection<T>> {
    try {
      return { error: false, ...(await fn()) } as HealthSection<T>;
    } catch (err) {
      this.logger.warn(`Sức khoẻ hệ thống: phần "${name}" lỗi: ${err instanceof Error ? err.message : String(err)}`);
      return { error: true };
    }
  }

  private app() {
    return {
      version: process.env.npm_package_version ?? '0.0.1',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
      region: process.env.VERCEL_REGION ?? null,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async database() {
    const t0 = Date.now();
    const rows: Array<{ v?: string }> = await this.dataSource.query('SELECT VERSION() AS v');
    return { ok: true, pingMs: Date.now() - t0, serverVersion: rows?.[0]?.v ?? null };
  }

  private async tables(fresh: boolean) {
    const now = Date.now();
    const cached = this.tablesCache;
    // `fresh` chỉ có tác dụng khi cache đã đủ cũ (chống bấm Làm mới dồn dập vào information_schema).
    const useCache = !!cached && now - cached.at < (fresh ? HEALTH_TABLES_FORCE_MIN_INTERVAL_MS : HEALTH_TABLES_CACHE_TTL_MS);
    if (!useCache) {
      const rows: Array<Record<string, unknown>> = await this.dataSource.query(
        `SELECT TABLE_NAME AS name, TABLE_ROWS AS table_rows, DATA_LENGTH AS data_length, INDEX_LENGTH AS index_length
           FROM information_schema.tables
          WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
      );
      const items = (rows ?? []).map((r) => classifyTable(String(r.name), Number(r.table_rows ?? 0), Number(r.data_length ?? 0) + Number(r.index_length ?? 0)));
      // Bảng cảnh báo lên đầu, rồi theo dung lượng giảm dần.
      items.sort((a, b) => Number(b.warn) - Number(a.warn) || b.sizeBytes - a.sizeBytes);
      this.tablesCache = { items, at: now };
    }
    const c = this.tablesCache!;
    return {
      items: c.items,
      totalBytes: c.items.reduce((s, i) => s + i.sizeBytes, 0),
      warnCount: c.items.filter((i) => i.warn).length,
      cachedAt: new Date(c.at).toISOString(),
      fromCache: useCache,
    };
  }

  private async cron() {
    const settings = await this.retention.getSettings();
    const schedule = await this.retention.getSchedule(settings.intervalDays);
    let warnReason: 'NEVER_RAN' | 'OVERDUE' | 'LAST_RUN_INCOMPLETE' | null = null;
    const last = schedule.lastRun;
    if (!last) warnReason = 'NEVER_RAN';
    else if (last.status === 'partial' || last.status === 'failed') warnReason = 'LAST_RUN_INCOMPLETE';
    else if (last.status !== 'running' && last.ageSeconds > (settings.intervalDays + HEALTH_CRON_OVERDUE_GRACE_DAYS) * 86400) warnReason = 'OVERDUE';
    return {
      job: 'retention',
      intervalDays: settings.intervalDays,
      lastRun: last,
      nextDueInSeconds: schedule.nextDueInSeconds,
      dueNow: schedule.dueNow,
      warn: warnReason !== null,
      warnReason,
    };
  }

  /** Quét ở ỨNG DỤNG (không JSON_LENGTH trong SQL: dòng bcrypt cũ không phải JSON) - đúng kiểu `getSessionCountMap`. */
  private async sessions() {
    const rows: Array<{ raw: string | null }> =
      (await this.dataSource.query('SELECT hashed_refresh_token AS raw FROM users WHERE hashed_refresh_token IS NOT NULL')) ?? [];
    const nowS = Math.floor(Date.now() / 1000);
    let total = 0;
    let users = 0;
    for (const r of rows) {
      const n = countRefreshSessions(r.raw, nowS);
      if (n > 0) {
        total += n;
        users += 1;
      }
    }
    return { totalSessions: total, usersWithSessions: users };
  }

  private async security() {
    const [locks, bans] = await Promise.all([
      this.dataSource.query('SELECT COUNT(*) AS n FROM login_ip_blocks WHERE blocked_until IS NOT NULL AND blocked_until > NOW()'),
      this.dataSource.query('SELECT COUNT(*) AS n FROM login_ip_blacklist WHERE expires_at IS NULL OR expires_at > NOW()'),
    ]);
    return { activeIpLocks: Number(locks?.[0]?.n ?? 0), activeIpBans: Number(bans?.[0]?.n ?? 0) };
  }
}

export function classifyTable(name: string, rows: number, sizeBytes: number): HealthTableItem {
  const watched = (HEALTH_WATCHED_TABLES as readonly string[]).includes(name);
  const warn = watched
    ? rows >= HEALTH_WATCHED_WARN_ROWS || sizeBytes >= HEALTH_WATCHED_WARN_BYTES
    : rows >= HEALTH_OTHER_WARN_ROWS || sizeBytes >= HEALTH_OTHER_WARN_BYTES;
  return { name, rowsEstimate: Math.max(0, rows), sizeBytes: Math.max(0, sizeBytes), watched, warn };
}
