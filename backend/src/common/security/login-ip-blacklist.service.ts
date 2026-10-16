import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginIpBlacklist } from '../../database/entities/login-ip-blacklist.entity';
import { normalizeIp } from './client-ip';
import { registerCacheProbe } from '../utils/cache-probe-registry';

export interface BlacklistRow {
    id: number;
    ip: string;
    reason: string | null;
    createdByName: string | null;
    /** Còn lại bao nhiêu giây (đồng hồ DB); `null` = vĩnh viễn. */
    remainingSeconds: number | null;
    /** Thêm cách đây bao nhiêu giây (đồng hồ DB, tránh lệch múi giờ khi serialize). */
    createdAgoSeconds: number;
}

export const IP_BLACKLIST_CACHE_TTL_MS = 15_000;
export const IP_BLACKLIST_MAX_ENTRIES = 500;
export const IP_BLACKLIST_MAX_DURATION_HOURS = 8760;
/** Dòng đã hết hạn quá số ngày này được dọn khi `list()`. */
export const IP_BLACKLIST_PURGE_AFTER_DAYS = 30;

/**
 * Blacklist IP đăng nhập (PLAN P3.7): IP đang bị chặn bị `AuthService.login`/`refresh` từ chối NGAY (trước cả bcrypt).
 * - Cache bộ nhớ ~15 giây/instance: `Map<ip, hạn (epoch ms) | null = vĩnh viễn>`; kiểm tra hạn LẠI mỗi lần hỏi nên
 *   dòng hết hạn không cần chờ cache hết.
 * - Thêm/gỡ xoá cache instance này; instance khác cập nhật sau ≤ 15 giây.
 * - Lỗi DB (vd chưa migrate) -> FAIL-OPEN: coi như KHÔNG có IP nào bị chặn + log error (không để bảng phụ làm sập
 *   đăng nhập của mọi người).
 */
@Injectable()
export class LoginIpBlacklistService {
    private readonly logger = new Logger(LoginIpBlacklistService.name);
    private cache: { map: Map<string, number | null>; expiresAt: number } | null = null;
    private readonly cacheProbeKey = registerCacheProbe({ key: 'ip_blacklist', label: 'Blacklist IP chủ động', ttlSeconds: IP_BLACKLIST_CACHE_TTL_MS / 1000, size: () => this.cache?.map.size ?? 0 });
    private inflight: Promise<Map<string, number | null>> | null = null;

    constructor(@InjectRepository(LoginIpBlacklist) private readonly repo: Repository<LoginIpBlacklist>) { }

    async isBanned(ip: string | null): Promise<boolean> {
        if (!ip) return false;
        const map = await this.getMap();
        if (!map.has(ip)) return false;
        const exp = map.get(ip);
        return exp === null || (exp as number) > Date.now();
    }

    private async getMap(): Promise<Map<string, number | null>> {
        const now = Date.now();
        if (this.cache && this.cache.expiresAt > now) return this.cache.map;
        if (this.inflight) return this.inflight;
        this.inflight = this.repo
            // `remaining` tính bằng đồng hồ DB rồi quy về epoch của instance -> không lệch múi giờ khi serialize.
            .query(
                `SELECT ip, CASE WHEN expires_at IS NULL THEN NULL ELSE TIMESTAMPDIFF(SECOND, NOW(), expires_at) END AS remaining
         FROM login_ip_blacklist WHERE expires_at IS NULL OR expires_at > NOW()`,
            )
            .then((rows: Array<{ ip: string; remaining: number | string | null }>) => {
                const base = Date.now();
                const map = new Map<string, number | null>();
                for (const r of rows) {
                    map.set(String(r.ip), r.remaining === null || r.remaining === undefined ? null : base + Number(r.remaining) * 1000);
                }
                this.cache = { map, expiresAt: Date.now() + IP_BLACKLIST_CACHE_TTL_MS };
                return map;
            })
            .catch((err: unknown) => {
                this.logger.error(
                    'Không đọc được login_ip_blacklist (đã chạy migration CreateLoginIpBlacklist chưa?) - coi như không có IP nào bị chặn',
                    err instanceof Error ? err.stack : undefined,
                );
                const empty = new Map<string, number | null>();
                this.cache = { map: empty, expiresAt: Date.now() + 5_000 };
                return empty;
            })
            .finally(() => {
                this.inflight = null;
            });
        return this.inflight;
    }

    invalidate(): void {
        this.cache = null;
    }

    /** Chỉ các dòng CÒN hiệu lực; dọn dòng đã hết hạn quá 30 ngày (best-effort). */
    async list(): Promise<BlacklistRow[]> {
        await this.repo
            .query(`DELETE FROM login_ip_blacklist WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL ${IP_BLACKLIST_PURGE_AFTER_DAYS} DAY`)
            .catch(() => null);
        const rows: Array<Record<string, any>> = await this.repo.query(
            `SELECT b.id, b.ip, b.reason, u.name AS created_by_name,
              CASE WHEN b.expires_at IS NULL THEN NULL ELSE TIMESTAMPDIFF(SECOND, NOW(), b.expires_at) END AS remaining_seconds,
              TIMESTAMPDIFF(SECOND, b.created_at, NOW()) AS created_ago_seconds
       FROM login_ip_blacklist b LEFT JOIN users u ON u.id = b.created_by
       WHERE b.expires_at IS NULL OR b.expires_at > NOW()
       ORDER BY b.id DESC LIMIT ${IP_BLACKLIST_MAX_ENTRIES}`,
        );
        return rows.map((r) => ({
            id: Number(r.id),
            ip: String(r.ip),
            reason: r.reason ?? null,
            createdByName: r.created_by_name ?? null,
            remainingSeconds: r.remaining_seconds === null || r.remaining_seconds === undefined ? null : Math.max(Number(r.remaining_seconds), 0),
            createdAgoSeconds: Math.max(Number(r.created_ago_seconds ?? 0), 0),
        }));
    }

    /**
     * Chặn IP. `durationHours` null/undefined = vĩnh viễn. Đồng thời GỠ IP khỏi whitelist và XOÁ dòng đếm/khoá bị động
     * (`login_ip_blocks`) để 1 IP không ở nhiều trạng thái. Nếu IP đã có dòng (kể cả hết hạn) -> cập nhật (gia hạn).
     * Hàng rào "không tự chặn IP hiện tại / IP nội bộ" nằm ở controller (cần IP của người thao tác).
     */
    async add(
        rawIp: string,
        reason: string | null,
        durationHours: number | null | undefined,
        actorId: number,
    ): Promise<{ id: number; ip: string; durationHours: number | null; removedWhitelist: boolean }> {
        const ip = normalizeIp(rawIp);
        if (!ip) throw new ConflictException('Địa chỉ IP không hợp lệ');
        const cnt: Array<{ c: string | number }> = await this.repo.query(
            `SELECT COUNT(*) AS c FROM login_ip_blacklist WHERE expires_at IS NULL OR expires_at > NOW()`,
        );
        if (Number(cnt[0]?.c ?? 0) >= IP_BLACKLIST_MAX_ENTRIES) {
            throw new ConflictException(`Blacklist tối đa ${IP_BLACKLIST_MAX_ENTRIES} IP`);
        }
        const hours =
            durationHours === null || durationHours === undefined
                ? null
                : Math.min(Math.max(Math.floor(Number(durationHours)), 1), IP_BLACKLIST_MAX_DURATION_HOURS);
        const cleanReason = reason?.trim() ? reason.trim().slice(0, 255) : null;
        // Hạn tính bằng đồng hồ DB (DATE_ADD(NOW(), ...)) cho đồng nhất với mọi so sánh `expires_at > NOW()`.
        const res = await this.repo.query(
            `INSERT INTO login_ip_blacklist (ip, reason, expires_at, created_by)
       VALUES (?, ?, ${hours === null ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? HOUR)'}, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), expires_at = VALUES(expires_at), created_by = VALUES(created_by), created_at = NOW()`,
            hours === null ? [ip, cleanReason, actorId] : [ip, cleanReason, hours, actorId],
        );
        const wl = await this.repo.query(`DELETE FROM login_ip_whitelist WHERE ip = ?`, [ip]).catch(() => null);
        await this.repo.query(`DELETE FROM login_ip_blocks WHERE ip = ?`, [ip]).catch(() => null);
        const row: Array<{ id: number }> = await this.repo.query(`SELECT id FROM login_ip_blacklist WHERE ip = ?`, [ip]);
        this.invalidate();
        return {
            id: Number(row[0]?.id ?? (res as { insertId?: number })?.insertId ?? 0),
            ip,
            durationHours: hours,
            removedWhitelist: Number((wl as { affectedRows?: number } | null)?.affectedRows ?? 0) > 0,
        };
    }

    /** Gỡ chặn. `null` nếu không có dòng. */
    async remove(rawIp: string): Promise<{ id: number; ip: string } | null> {
        const ip = normalizeIp(rawIp);
        if (!ip) return null;
        const rows: Array<{ id: number; ip: string }> = await this.repo.query(`SELECT id, ip FROM login_ip_blacklist WHERE ip = ?`, [ip]);
        if (rows.length === 0) return null;
        await this.repo.query(`DELETE FROM login_ip_blacklist WHERE ip = ?`, [ip]);
        this.invalidate();
        return { id: Number(rows[0].id), ip: String(rows[0].ip) };
    }
}
