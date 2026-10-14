import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { AuditService } from '../audit/audit.service';
import { Role } from '../../common/enums/role.enum';
import { UpdateRetentionSettingsDto } from './dto/retention.dto';
import {
  NOTIFICATION_UNREAD_DAYS_DEFAULT,
  NOTIFICATION_UNREAD_DAYS_KEY,
  NOTIFICATION_UNREAD_DAYS_MIN,
  RETENTION_ALL,
  RETENTION_BATCH_SIZE,
  RETENTION_INTERVAL_DEFAULT,
  RETENTION_INTERVAL_KEY,
  RETENTION_INTERVAL_MAX,
  RETENTION_INTERVAL_MIN,
  RETENTION_JOB,
  RETENTION_PROTECTED_AUDIT_ACTIONS,
  RETENTION_RUNNING_STALE_SECONDS,
  RETENTION_TARGETS,
  RETENTION_TARGET_CONFIG,
  RETENTION_TIME_BUDGET_MS,
  RetentionTarget,
} from './retention.constants';

export interface RetentionTargetSettings {
  enabled: boolean;
  retentionDays: number;
}

export interface RetentionSettings {
  intervalDays: number;
  auditLogs: RetentionTargetSettings;
  taskAuditLogs: RetentionTargetSettings;
  notifications: RetentionTargetSettings & { unreadRetentionDays: number };
  attendanceLogs: RetentionTargetSettings;
}

export interface RetentionSchedule {
  /** Lần chạy đủ-mọi-đối-tượng gần nhất (null = chưa chạy lần nào). Thời gian tính bằng SỐ GIÂY theo đồng hồ DB. */
  lastRun: { status: string; affected: number; message: string | null; ageSeconds: number } | null;
  /** Số giây tới lần chạy tiếp theo (0 = đã đến hạn; null không xảy ra). */
  nextDueInSeconds: number;
  dueNow: boolean;
}

export interface RetentionTargetResult {
  target: RetentionTarget;
  /** dryRun: số dòng SẼ xoá; chạy thật: số dòng ĐÃ xoá. */
  count: number;
  partial: boolean;
  skipped?: 'DISABLED';
  error?: string;
}

export interface RetentionRunResult {
  skipped?: boolean;
  reason?: 'NOT_DUE' | 'ALREADY_RUNNING';
  nextDueInSeconds?: number;
  dryRun?: boolean;
  status?: 'success' | 'partial' | 'failed';
  affected?: number;
  results?: RetentionTargetResult[];
}

interface TargetSql {
  table: string;
  where: string;
  params: Array<number | string>;
}

/**
 * Retention tự động (PLAN_RETENTION_SECURITY_ROADMAP, Phase 1).
 *
 * Vercel serverless -> không có tiến trình nền; `runIfDue()` được gọi từ 1 endpoint cron (kích hoạt hằng ngày)
 * và TỰ KIỂM "đến hạn chưa" theo chu kỳ lưu trong `settings` (14/30 ngày...), nên đổi chu kỳ từ FE được
 * dù lịch trong vercel.json là file tĩnh.
 *
 * - Mọi cutoff tính bằng đồng hồ DB (`NOW() - INTERVAL ? DAY`), thời gian còn lại trả về dạng SỐ GIÂY.
 * - Xoá theo lô (`DELETE ... LIMIT`) + ngân sách thời gian; chưa xoá hết -> status `partial`, lần kích hoạt kế tiếp
 *   làm tiếp ngay (không chờ hết chu kỳ). Idempotent.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly auditService: AuditService,
  ) {}

  // ───────────────────────── Cấu hình ─────────────────────────

  private allSettingKeys(): string[] {
    const keys = [RETENTION_INTERVAL_KEY, NOTIFICATION_UNREAD_DAYS_KEY];
    for (const t of RETENTION_TARGETS) {
      keys.push(RETENTION_TARGET_CONFIG[t].enabledKey, RETENTION_TARGET_CONFIG[t].daysKey);
    }
    return keys;
  }

  private parseDays(raw: string | undefined, def: number, min: number, max = 3650): number {
    const n = raw === undefined ? NaN : parseInt(raw, 10);
    // Giá trị lạ/ngoài khoảng -> dùng mặc định + warn, KHÔNG để cấu hình xấu làm xoá quá tay.
    if (!Number.isFinite(n) || n < min || n > max) {
      if (raw !== undefined) this.logger.warn(`[Retention] Giá trị "${raw}" không hợp lệ (min ${min}) -> dùng mặc định ${def}.`);
      return def;
    }
    return n;
  }

  async getSettings(): Promise<RetentionSettings> {
    const rows = await this.settingRepository.find({ where: { key: In(this.allSettingKeys()) } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const target = (t: RetentionTarget): RetentionTargetSettings => {
      const c = RETENTION_TARGET_CONFIG[t];
      const rawEnabled = map.get(c.enabledKey);
      return {
        enabled: rawEnabled === undefined ? c.defaultEnabled : rawEnabled === 'true',
        retentionDays: this.parseDays(map.get(c.daysKey), c.defaultDays, c.minDays),
      };
    };
    return {
      intervalDays: this.parseDays(
        map.get(RETENTION_INTERVAL_KEY),
        RETENTION_INTERVAL_DEFAULT,
        RETENTION_INTERVAL_MIN,
        RETENTION_INTERVAL_MAX,
      ),
      auditLogs: target('audit_logs'),
      taskAuditLogs: target('task_audit_logs'),
      notifications: {
        ...target('notifications'),
        unreadRetentionDays: this.parseDays(
          map.get(NOTIFICATION_UNREAD_DAYS_KEY),
          NOTIFICATION_UNREAD_DAYS_DEFAULT,
          NOTIFICATION_UNREAD_DAYS_MIN,
        ),
      },
      attendanceLogs: target('attendance_logs'),
    };
  }

  async getSettingsWithSchedule(): Promise<RetentionSettings & { schedule: RetentionSchedule }> {
    const settings = await this.getSettings();
    const schedule = await this.getSchedule(settings.intervalDays);
    return { ...settings, schedule };
  }

  async updateSettings(dto: UpdateRetentionSettingsDto, actor: { id: number; role: string }) {
    // Dữ liệu chấm công/lương: chỉ Admin được đổi (khớp `attendance.delete` — chỉ Admin).
    if (dto.attendanceLogs && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ Admin được thay đổi cấu hình dọn dẹp dữ liệu chấm công.');
    }

    const rows: Array<{ key: string; value: string }> = [];
    const push = (key: string, value: unknown) => {
      if (value !== undefined && value !== null) rows.push({ key, value: String(value) });
    };
    const pushTarget = (t: RetentionTarget, s?: { enabled?: boolean; retentionDays?: number }) => {
      if (!s) return;
      const c = RETENTION_TARGET_CONFIG[t];
      push(c.enabledKey, s.enabled);
      push(c.daysKey, s.retentionDays);
    };

    push(RETENTION_INTERVAL_KEY, dto.intervalDays);
    pushTarget('audit_logs', dto.auditLogs);
    pushTarget('task_audit_logs', dto.taskAuditLogs);
    pushTarget('notifications', dto.notifications);
    push(NOTIFICATION_UNREAD_DAYS_KEY, dto.notifications?.unreadRetentionDays);
    pushTarget('attendance_logs', dto.attendanceLogs);

    if (rows.length > 0) await this.settingRepository.save(rows);

    await this.auditService.logAction(actor.id, 'UPDATE_RETENTION_SETTINGS', 'setting', 0, null, dto);
    return this.getSettingsWithSchedule();
  }

  // ───────────────────────── Lịch (đến hạn chưa?) ─────────────────────────

  private async getLatestAllRun(): Promise<{ id: number; status: string; affected: number; message: string | null; age: number } | null> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT id, status, affected, message,
              TIMESTAMPDIFF(SECOND, COALESCE(finished_at, started_at), NOW()) AS age
         FROM cron_runs
        WHERE job = ? AND target = ?
        ORDER BY id DESC
        LIMIT 1`,
      [RETENTION_JOB, RETENTION_ALL],
    );
    const r = rows?.[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      status: String(r.status),
      affected: Number(r.affected ?? 0),
      message: (r.message as string | null) ?? null,
      age: Math.max(0, Number(r.age ?? 0)),
    };
  }

  async getSchedule(intervalDays: number): Promise<RetentionSchedule> {
    const last = await this.getLatestAllRun();
    if (!last) return { lastRun: null, nextDueInSeconds: 0, dueNow: true };

    const lastRun = { status: last.status, affected: last.affected, message: last.message, ageSeconds: last.age };
    // Lần trước chưa xong (partial/failed) -> làm tiếp ngay ở lần kích hoạt kế tiếp, không chờ hết chu kỳ.
    if (last.status === 'partial' || last.status === 'failed') {
      return { lastRun, nextDueInSeconds: 0, dueNow: true };
    }
    if (last.status === 'running') {
      const stale = last.age >= RETENTION_RUNNING_STALE_SECONDS;
      return { lastRun, nextDueInSeconds: stale ? 0 : RETENTION_RUNNING_STALE_SECONDS - last.age, dueNow: stale };
    }
    const remaining = intervalDays * 86400 - last.age;
    return { lastRun, nextDueInSeconds: Math.max(0, remaining), dueNow: remaining <= 0 };
  }

  // ───────────────────────── Chạy ─────────────────────────

  /** Điểm vào của cron: chỉ chạy khi đến hạn. */
  async runIfDue(): Promise<RetentionRunResult> {
    const settings = await this.getSettings();
    const last = await this.getLatestAllRun();
    if (last?.status === 'running' && last.age < RETENTION_RUNNING_STALE_SECONDS) {
      return { skipped: true, reason: 'ALREADY_RUNNING' };
    }
    const schedule = await this.getSchedule(settings.intervalDays);
    if (!schedule.dueNow) {
      return { skipped: true, reason: 'NOT_DUE', nextDueInSeconds: schedule.nextDueInSeconds };
    }
    return this.run({ settings });
  }

  /**
   * Chạy thật/thử. `target` bỏ trống = mọi đối tượng ĐANG BẬT (và ghi mốc chu kỳ `all`).
   * `target` cụ thể = chạy tay 1 đối tượng, KHÔNG đổi mốc chu kỳ.
   */
  async run(options: { target?: RetentionTarget; dryRun?: boolean; settings?: RetentionSettings } = {}): Promise<RetentionRunResult> {
    const dryRun = options.dryRun === true;
    const settings = options.settings ?? (await this.getSettings());
    const targets = options.target ? [options.target] : RETENTION_TARGETS;

    let runId: number | null = null;
    if (!dryRun) {
      const res = await this.dataSource.query(
        `INSERT INTO cron_runs (job, target, started_at, status, affected) VALUES (?, ?, NOW(), 'running', 0)`,
        [RETENTION_JOB, options.target ?? RETENTION_ALL],
      );
      runId = Number((res as { insertId?: number })?.insertId ?? 0) || null;
    }

    const startedAt = Date.now();
    const results: RetentionTargetResult[] = [];
    for (const target of targets) {
      const cfg = this.settingsOf(settings, target);
      if (!cfg.enabled) {
        results.push({ target, count: 0, partial: false, skipped: 'DISABLED' });
        continue;
      }
      try {
        const sql = this.buildSql(target, settings);
        results.push(
          dryRun
            ? await this.countTarget(target, sql)
            : await this.deleteTarget(target, sql, startedAt),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Retention] ${target} thất bại: ${message}`);
        results.push({ target, count: 0, partial: false, error: message });
      }
    }

    const affected = results.reduce((sum, r) => sum + r.count, 0);
    const status: 'success' | 'partial' | 'failed' = results.some((r) => r.error)
      ? 'failed'
      : results.some((r) => r.partial)
        ? 'partial'
        : 'success';

    if (!dryRun && runId) {
      await this.dataSource.query(
        `UPDATE cron_runs SET finished_at = NOW(), status = ?, affected = ?, message = ? WHERE id = ?`,
        [status, affected, JSON.stringify(results).slice(0, 4000), runId],
      );
      this.logger.log(`[Retention] ${status}: đã xoá ${affected} dòng (${results.map((r) => `${r.target}=${r.count}`).join(', ')}).`);
    }
    return { dryRun, status, affected, results };
  }

  private settingsOf(s: RetentionSettings, t: RetentionTarget): RetentionTargetSettings {
    switch (t) {
      case 'audit_logs':
        return s.auditLogs;
      case 'task_audit_logs':
        return s.taskAuditLogs;
      case 'notifications':
        return s.notifications;
      case 'attendance_logs':
        return s.attendanceLogs;
    }
  }

  private buildSql(target: RetentionTarget, s: RetentionSettings): TargetSql {
    switch (target) {
      case 'audit_logs': {
        const protectedActions = RETENTION_PROTECTED_AUDIT_ACTIONS;
        const placeholders = protectedActions.map(() => '?').join(',');
        return {
          table: 'audit_logs',
          where: `created_at < NOW() - INTERVAL ? DAY AND action NOT IN (${placeholders})`,
          params: [s.auditLogs.retentionDays, ...protectedActions],
        };
      }
      case 'task_audit_logs':
        return {
          table: 'periodic_task_audit_logs',
          where: 'created_at < NOW() - INTERVAL ? DAY',
          params: [s.taskAuditLogs.retentionDays],
        };
      case 'notifications':
        // Đã đọc: tính từ lúc đọc; chưa đọc: giữ lâu hơn, tính từ lúc tạo.
        return {
          table: 'notifications',
          where:
            '((read_at IS NOT NULL AND read_at < NOW() - INTERVAL ? DAY) OR (read_at IS NULL AND created_at < NOW() - INTERVAL ? DAY))',
          params: [s.notifications.retentionDays, s.notifications.unreadRetentionDays],
        };
      case 'attendance_logs':
        return {
          table: 'attendance_logs',
          where: 'record_time < NOW() - INTERVAL ? DAY',
          params: [s.attendanceLogs.retentionDays],
        };
    }
  }

  private async countTarget(target: RetentionTarget, sql: TargetSql): Promise<RetentionTargetResult> {
    const rows: Array<{ c: string | number }> = await this.dataSource.query(
      `SELECT COUNT(*) AS c FROM \`${sql.table}\` WHERE ${sql.where}`,
      sql.params,
    );
    return { target, count: Number(rows?.[0]?.c ?? 0), partial: false };
  }

  private async deleteTarget(target: RetentionTarget, sql: TargetSql, startedAt: number): Promise<RetentionTargetResult> {
    let total = 0;
    for (;;) {
      const res = await this.dataSource.query(
        `DELETE FROM \`${sql.table}\` WHERE ${sql.where} LIMIT ${RETENTION_BATCH_SIZE}`,
        sql.params,
      );
      const n = Number((res as { affectedRows?: number })?.affectedRows ?? 0);
      total += n;
      if (n < RETENTION_BATCH_SIZE) return { target, count: total, partial: false };
      // Lô đầy -> có thể còn dữ liệu; hết ngân sách thời gian thì dừng, lần kích hoạt sau làm tiếp.
      if (Date.now() - startedAt >= RETENTION_TIME_BUDGET_MS) return { target, count: total, partial: true };
    }
  }
}
