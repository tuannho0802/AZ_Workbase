import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginIpWhitelist } from '../../database/entities/login-ip-whitelist.entity';
import { normalizeIp } from './client-ip';

export interface WhitelistRow {
    id: number;
    ip: string;
    note: string | null;
    createdByName: string | null;
    /** Thêm cách đây bao nhiêu giây (đồng hồ DB, tránh lệch múi giờ khi serialize). */
    createdAgoSeconds: number;
}

export const IP_WHITELIST_CACHE_TTL_MS = 30_000;
export const IP_WHITELIST_MAX_ENTRIES = 200;

/**
 * Whitelist IP đăng nhập (PLAN P3.5): IP trong danh sách không bị khoá theo IP — `AuthService.login` bỏ qua cả kiểm
 * tra khoá lẫn bộ đếm cho IP này. Khoá theo TÀI KHOẢN KHÔNG đổi.
 * - Cache bộ nhớ ~30 giây/instance (đọc mỗi lần đăng nhập, không thêm 1 query/lần); thêm/xoá xoá cache instance này,
 *   instance khác cập nhật sau ≤ 30 giây.
 * - Lỗi DB (vd chưa chạy migration) -> coi như KHÔNG có trong whitelist (an toàn: không vô tình bỏ chặn) + log error.
 */
@Injectable()
export class LoginIpWhitelistService {
    private readonly logger = new Logger(LoginIpWhitelistService.name);
    private cache: { ips: Set<string>; expiresAt: number } | null = null;
    private inflight: Promise<Set<string>> | null = null;

    constructor(@InjectRepository(LoginIpWhitelist) private readonly repo: Repository<LoginIpWhitelist>) { }

    async isWhitelisted(ip: string | null): Promise<boolean> {
        if (!ip) return false;
        const set = await this.getSet();
        return set.has(ip);
    }

    private async getSet(): Promise<Set<string>> {
        const now = Date.now();
        if (this.cache && this.cache.expiresAt > now) return this.cache.ips;
        if (this.inflight) return this.inflight;
        this.inflight = this.repo
            .query(`SELECT ip FROM login_ip_whitelist`)
            .then((rows: Array<{ ip: string }>) => {
                const ips = new Set(rows.map((r) => String(r.ip)));
                this.cache = { ips, expiresAt: Date.now() + IP_WHITELIST_CACHE_TTL_MS };
                return ips;
            })
            .catch((err: unknown) => {
                this.logger.error(
                    'Không đọc được login_ip_whitelist (đã chạy migration CreateLoginIpWhitelist chưa?) - coi như không có IP nào được miễn',
                    err instanceof Error ? err.stack : undefined,
                );
                // Không cache lỗi quá lâu: thử lại sau 5 giây.
                const empty = new Set<string>();
                this.cache = { ips: empty, expiresAt: Date.now() + 5_000 };
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

    async list(): Promise<WhitelistRow[]> {
        const rows: Array<Record<string, any>> = await this.repo.query(
            `SELECT w.id, w.ip, w.note, u.name AS created_by_name,
              TIMESTAMPDIFF(SECOND, w.created_at, NOW()) AS created_ago_seconds
       FROM login_ip_whitelist w LEFT JOIN users u ON u.id = w.created_by
       ORDER BY w.id DESC LIMIT ${IP_WHITELIST_MAX_ENTRIES}`,
        );
        return rows.map((r) => ({
            id: Number(r.id),
            ip: String(r.ip),
            note: r.note ?? null,
            createdByName: r.created_by_name ?? null,
            createdAgoSeconds: Math.max(Number(r.created_ago_seconds ?? 0), 0),
        }));
    }

    /**
     * Thêm IP. `normalizeIp` là hàng rào định dạng. Đồng thời XOÁ dòng đếm/khoá hiện có của IP đó trong
     * `login_ip_blocks` (đang bị khoá thì được mở ngay). Trả `{ id, ip, clearedBlock }` để caller ghi audit.
     */
    async add(rawIp: string, note: string | null, actorId: number): Promise<{ id: number; ip: string; clearedBlock: boolean }> {
        const ip = normalizeIp(rawIp);
        if (!ip) throw new ConflictException('Địa chỉ IP không hợp lệ');
        const cnt: Array<{ c: string | number }> = await this.repo.query(`SELECT COUNT(*) AS c FROM login_ip_whitelist`);
        if (Number(cnt[0]?.c ?? 0) >= IP_WHITELIST_MAX_ENTRIES) {
            throw new ConflictException(`Whitelist tối đa ${IP_WHITELIST_MAX_ENTRIES} IP`);
        }
        const cleanNote = note?.trim() ? note.trim().slice(0, 255) : null;
        try {
            const res = await this.repo.query(`INSERT INTO login_ip_whitelist (ip, note, created_by) VALUES (?, ?, ?)`, [
                ip,
                cleanNote,
                actorId,
            ]);
            const cleared = await this.repo.query(`DELETE FROM login_ip_blocks WHERE ip = ?`, [ip]).catch(() => null);
            this.invalidate();
            return {
                id: Number((res as { insertId?: number })?.insertId ?? 0),
                ip,
                clearedBlock: Number((cleared as { affectedRows?: number } | null)?.affectedRows ?? 0) > 0,
            };
        } catch (err) {
            if ((err as { code?: string })?.code === 'ER_DUP_ENTRY') throw new ConflictException('IP này đã có trong whitelist');
            throw err;
        }
    }

    /** Xoá IP khỏi whitelist. `null` nếu không có dòng. */
    async remove(rawIp: string): Promise<{ id: number; ip: string } | null> {
        const ip = normalizeIp(rawIp);
        if (!ip) return null;
        const rows: Array<{ id: number; ip: string }> = await this.repo.query(
            `SELECT id, ip FROM login_ip_whitelist WHERE ip = ?`,
            [ip],
        );
        if (rows.length === 0) return null;
        await this.repo.query(`DELETE FROM login_ip_whitelist WHERE ip = ?`, [ip]);
        this.invalidate();
        return { id: Number(rows[0].id), ip: String(rows[0].ip) };
    }
}