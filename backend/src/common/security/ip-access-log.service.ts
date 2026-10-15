import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpAccessStats } from '../../database/entities/ip-access-stats.entity';
import { normalizeIp } from './client-ip';
import { sanitizeEmailForAudit } from './security-audit';
import { SecurityConfigService } from './security-config.service';

export type IpAccessOutcome =
    | 'success' | 'wrong_password' | 'unknown_email' | 'account_locked'
    | 'ip_locked' | 'denied' | 'refresh_ok' | 'refresh_failed';
export type IpAccessStatus = 'normal' | 'whitelisted' | 'blocked';

export interface IpAccessRecordInput {
    ip: string | null;
    countryCode: string | null;
    endpoint: 'auth/login' | 'auth/refresh';
    outcome: IpAccessOutcome;
    ipStatus: IpAccessStatus;
    userId?: number | null;
    email?: string | null;
    userAgent?: string | null;
}

/** `success_hits` CHỈ là đăng nhập thành công (refresh không làm phồng số lần đăng nhập). */
export function classifyOutcome(outcome: IpAccessOutcome): { success: 0 | 1; failed: 0 | 1; blocked: 0 | 1 } {
    if (outcome === 'success') return { success: 1, failed: 0, blocked: 0 };
    if (outcome === 'ip_locked') return { success: 0, failed: 0, blocked: 1 };
    if (outcome === 'refresh_ok') return { success: 0, failed: 0, blocked: 0 };
    return { success: 0, failed: 1, blocked: 0 };
}

export interface IpAccessListFilters {
    status?: 'all' | 'blocked' | 'whitelisted' | 'banned';
    search?: string;
    page: number;
    limit: number;
}

/**
 * P3.6 — theo dõi lượt truy cập theo IP. Bộ đếm `ip_access_stats` luôn được cộng (1 upsert nguyên tử, đồng hồ DB);
 * dòng chi tiết `ip_access_logs` chỉ ghi khi chưa vượt `ip_access_detail_cap_per_hour` của IP trong giờ đó.
 * Mọi lỗi ghi đều bị nuốt: log KHÔNG BAO GIỜ làm hỏng đăng nhập.
 */
@Injectable()
export class IpAccessLogService {
    private readonly logger = new Logger(IpAccessLogService.name);

    constructor(
        @InjectRepository(IpAccessStats) private readonly repo: Repository<IpAccessStats>,
        private readonly config: SecurityConfigService,
    ) { }

    async record(input: IpAccessRecordInput): Promise<void> {
        const ip = normalizeIp(input.ip);
        if (!ip) return;
        try {
            const cap = (await this.config.get()).ipAccessDetailCapPerHour;
            const c = classifyOutcome(input.outcome);
            await this.repo.query(
                `INSERT INTO ip_access_stats
           (ip, total_hits, success_hits, failed_hits, blocked_hits, suppressed_hits, first_seen_at, last_seen_at,
            last_outcome, last_country_code, detail_window_started_at, detail_window_count)
         VALUES (?, 1, ?, ?, ?, 0, NOW(), NOW(), ?, ?, NOW(), 1)
         ON DUPLICATE KEY UPDATE
           total_hits = total_hits + 1,
           success_hits = success_hits + VALUES(success_hits),
           failed_hits = failed_hits + VALUES(failed_hits),
           blocked_hits = blocked_hits + VALUES(blocked_hits),
           detail_window_count = IF(detail_window_started_at IS NULL OR detail_window_started_at < (NOW() - INTERVAL 1 HOUR), 1, detail_window_count + 1),
           detail_window_started_at = IF(detail_window_started_at IS NULL OR detail_window_started_at < (NOW() - INTERVAL 1 HOUR), NOW(), detail_window_started_at),
           suppressed_hits = suppressed_hits + IF(detail_window_count > ?, 1, 0),
           last_seen_at = NOW(),
           last_outcome = VALUES(last_outcome),
           last_country_code = COALESCE(VALUES(last_country_code), last_country_code)`,
                [ip, c.success, c.failed, c.blocked, input.outcome, input.countryCode, cap],
            );
            await this.repo.query(
                `INSERT INTO ip_access_logs (ip, country_code, endpoint, outcome, ip_status, user_id, email, user_agent, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, NOW() FROM ip_access_stats WHERE ip = ? AND detail_window_count <= ?`,
                [ip, input.countryCode, input.endpoint, input.outcome, input.ipStatus, input.userId ?? null,
                    sanitizeEmailForAudit(input.email), input.userAgent ? input.userAgent.slice(0, 255) : null, ip, cap],
            );
        } catch (err) {
            this.logger.warn(`Không ghi được lượt truy cập IP: ${err instanceof Error ? err.message : 'lỗi không rõ'}`);
        }
    }

    /** Danh sách IP (đọc từ `ip_access_stats`) + trạng thái HIỆN TẠI (khoá/whitelist). */
    async list(f: IpAccessListFilters) {
        const where: string[] = [];
        const params: unknown[] = [];
        if (f.search?.trim()) {
            where.push('s.ip LIKE ?');
            params.push(`%${f.search.trim().replace(/[%_\\]/g, '')}%`);
        }
        const isBlocked = `(b.blocked_until IS NOT NULL AND b.blocked_until > NOW())`;
        const isWl = `(w.id IS NOT NULL)`;
        const isBanned = `(bl.id IS NOT NULL AND (bl.expires_at IS NULL OR bl.expires_at > NOW()))`;
        if (f.status === 'banned') where.push(isBanned);
        if (f.status === 'blocked') where.push(isBlocked);
        if (f.status === 'whitelisted') where.push(isWl);
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const base = `FROM ip_access_stats s
      LEFT JOIN login_ip_blocks b ON b.ip = s.ip
      LEFT JOIN login_ip_whitelist w ON w.ip = s.ip
      LEFT JOIN login_ip_blacklist bl ON bl.ip = s.ip ${whereSql}`;
        const [{ total }] = (await this.repo.query(`SELECT COUNT(*) AS total ${base}`, params)) ?? [{ total: 0 }];
        const rows: any[] = (await this.repo.query(
            `SELECT s.ip, s.total_hits AS totalHits, s.success_hits AS successHits, s.failed_hits AS failedHits,
              s.blocked_hits AS blockedHits, s.suppressed_hits AS suppressedHits, s.api_hits AS apiHits, s.last_outcome AS lastOutcome,
              s.last_country_code AS lastCountryCode,
              TIMESTAMPDIFF(SECOND, s.first_seen_at, NOW()) AS firstSeenAgoSeconds,
              TIMESTAMPDIFF(SECOND, s.last_seen_at, NOW()) AS lastSeenAgoSeconds,
              ${isBlocked} AS blocked, ${isWl} AS whitelisted, ${isBanned} AS banned
       ${base} ORDER BY s.last_seen_at DESC LIMIT ? OFFSET ?`,
            [...params, f.limit, (f.page - 1) * f.limit],
        )) ?? [];
        return {
            total: Number(total) || 0,
            page: f.page,
            limit: f.limit,
            items: rows.map((r) => ({
                ip: String(r.ip),
                totalHits: Number(r.totalHits),
                successHits: Number(r.successHits),
                failedHits: Number(r.failedHits),
                blockedHits: Number(r.blockedHits),
                suppressedHits: Number(r.suppressedHits),
                apiHits: Number(r.apiHits ?? 0),
                lastOutcome: r.lastOutcome ?? null,
                lastCountryCode: r.lastCountryCode ?? null,
                firstSeenAgoSeconds: Number(r.firstSeenAgoSeconds),
                lastSeenAgoSeconds: Number(r.lastSeenAgoSeconds),
                currentStatus: Number(r.banned) ? 'banned' : Number(r.blocked) ? 'blocked' : Number(r.whitelisted) ? 'whitelisted' : 'normal',
            })),
        };
    }

    /** Tóm tắt + log phân trang của 1 IP. Thời gian trả dạng "cách đây N giây" (đồng hồ DB, tránh lệch múi giờ). */
    async detail(ipRaw: string, opts: { page: number; limit: number; outcome?: string; from?: string; to?: string }) {
        const ip = normalizeIp(ipRaw);
        if (!ip) return null;
        const [stats] = (await this.repo.query(
            `SELECT s.*, TIMESTAMPDIFF(SECOND, s.first_seen_at, NOW()) AS first_ago, TIMESTAMPDIFF(SECOND, s.last_seen_at, NOW()) AS last_ago,
              (b.blocked_until IS NOT NULL AND b.blocked_until > NOW()) AS blocked, (w.id IS NOT NULL) AS whitelisted,
              (bl.id IS NOT NULL AND (bl.expires_at IS NULL OR bl.expires_at > NOW())) AS banned
       FROM ip_access_stats s
       LEFT JOIN login_ip_blocks b ON b.ip = s.ip
       LEFT JOIN login_ip_whitelist w ON w.ip = s.ip
       LEFT JOIN login_ip_blacklist bl ON bl.ip = s.ip WHERE s.ip = ?`,
            [ip],
        )) ?? [];
        if (!stats) return null;
        const where = ['l.ip = ?'];
        const params: unknown[] = [ip];
        if (opts.outcome) { where.push('l.outcome = ?'); params.push(opts.outcome); }
        if (opts.from) { where.push('l.created_at >= ?'); params.push(`${opts.from} 00:00:00`); }
        if (opts.to) { where.push('l.created_at <= ?'); params.push(`${opts.to} 23:59:59`); }
        const whereSql = where.join(' AND ');
        const [{ total }] = (await this.repo.query(`SELECT COUNT(*) AS total FROM ip_access_logs l WHERE ${whereSql}`, params)) ?? [{ total: 0 }];
        const logs: any[] = (await this.repo.query(
            `SELECT l.id, l.endpoint, l.endpoint_group AS endpointGroup, l.hit_count AS hitCount, l.last_status AS lastStatus,
              l.outcome, l.ip_status AS ipStatus, l.user_id AS userId, l.email, l.user_agent AS userAgent,
              u.name AS userName, TIMESTAMPDIFF(SECOND, l.created_at, NOW()) AS agoSeconds
       FROM ip_access_logs l LEFT JOIN users u ON u.id = l.user_id
       WHERE ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
            [...params, opts.limit, (opts.page - 1) * opts.limit],
        )) ?? [];
        return {
            ip,
            summary: {
                totalHits: Number(stats.total_hits),
                successHits: Number(stats.success_hits),
                failedHits: Number(stats.failed_hits),
                blockedHits: Number(stats.blocked_hits),
                suppressedHits: Number(stats.suppressed_hits),
                apiHits: Number(stats.api_hits ?? 0),
                firstSeenAgoSeconds: Number(stats.first_ago),
                lastSeenAgoSeconds: Number(stats.last_ago),
                currentStatus: Number(stats.banned) ? 'banned' : Number(stats.blocked) ? 'blocked' : Number(stats.whitelisted) ? 'whitelisted' : 'normal',
            },
            total: Number(total) || 0,
            page: opts.page,
            limit: opts.limit,
            logs: logs.map((r) => ({
                id: String(r.id), endpoint: r.endpoint, endpointGroup: r.endpointGroup ?? null,
                hitCount: Number(r.hitCount ?? 1), lastStatus: r.lastStatus == null ? null : Number(r.lastStatus),
                outcome: r.outcome, ipStatus: r.ipStatus,
                userId: r.userId ?? null, userName: r.userName ?? null, email: r.email ?? null,
                userAgent: r.userAgent ?? null, agoSeconds: Number(r.agoSeconds),
            })),
        };
    }
}
