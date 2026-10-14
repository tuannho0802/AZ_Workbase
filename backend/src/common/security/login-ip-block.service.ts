import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginIpBlock } from '../../database/entities/login-ip-block.entity';
import { normalizeIp } from '../../common/security/client-ip';

export interface IpBlockRow {
    id: number;
    ip: string;
    failedCount: number;
    lastEmail: string | null;
    /** Số giây còn khoá (0 = hiện không khoá, chỉ là bộ đếm gần đây). */
    lockedSeconds: number;
    windowStartedAt: Date | string;
    updatedAt: Date | string;
}

/** Chỉ lưu `last_email` nếu đúng dạng email (tránh lưu nhầm mật khẩu gõ vào ô email). Chuẩn hoá chữ thường. */
export function sanitizeEmailForLog(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const e = raw.trim().toLowerCase();
    if (e.length === 0 || e.length > 255) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/**
 * Khoá đăng nhập theo IP (PLAN P3.2). Bảng DB là nguồn sự thật (KHÔNG dùng @Throttle trong bộ nhớ: mỗi instance
 * serverless đếm riêng). Mọi thời gian so bằng NOW() của DB. Lỗi DB -> fail-open + log error (đăng nhập không được
 * sập vì bảng chống brute-force; khoá theo TÀI KHOẢN vẫn còn).
 */
@Injectable()
export class LoginIpBlockService {
    private readonly logger = new Logger(LoginIpBlockService.name);

    constructor(@InjectRepository(LoginIpBlock) private readonly repo: Repository<LoginIpBlock>) { }

    /** Số giây IP còn bị khoá (0 = không khoá). */
    async getRemainingSeconds(ip: string | null): Promise<number> {
        if (!ip) return 0;
        try {
            const rows: Array<{ s: number | string | null }> = await this.repo.query(
                `SELECT GREATEST(TIMESTAMPDIFF(SECOND, NOW(), blocked_until), 0) AS s
         FROM login_ip_blocks WHERE ip = ? AND blocked_until IS NOT NULL AND blocked_until > NOW()`,
                [ip],
            );
            return Number(rows[0]?.s ?? 0);
        } catch (err) {
            this.logger.error('Không đọc được login_ip_blocks - bỏ qua khoá IP', err instanceof Error ? err.stack : undefined);
            return 0;
        }
    }

    /**
     * Ghi nhận 1 lần đăng nhập SAI từ `ip` (email không tồn tại HOẶC sai mật khẩu) bằng 1 câu
     * `INSERT … ON DUPLICATE KEY UPDATE` nguyên tử (an toàn khi nhiều instance serverless chạy song song).
     * Thứ tự gán cột QUAN TRỌNG: MySQL đánh giá từ trái qua phải và cột gán sau thấy giá trị MỚI của cột gán trước:
     *   1) failed_count      — dùng giá trị CŨ của blocked_until/window_started_at
     *   2) window_started_at — dùng giá trị CŨ (chưa bị gán)
     *   3) blocked_until     — cuối cùng, thấy failed_count MỚI, và blocked_until CŨ của chính nó
     * Quy tắc: đang khoá -> giữ nguyên (không cộng); khoá đã hết hạn HOẶC quá cửa sổ -> đếm lại từ 1; còn lại +1;
     * chạm ngưỡng -> blocked_until = NOW() + lockMinutes.
     */
    async recordFailure(
        ip: string | null,
        email: unknown,
        cfg: { maxAttempts: number; windowMinutes: number; lockMinutes: number },
    ): Promise<{ attempts: number; lockedSeconds: number }> {
        if (!ip) return { attempts: 0, lockedSeconds: 0 };
        const safeEmail = sanitizeEmailForLog(email);
        try {
            await this.repo.query(
                `INSERT INTO login_ip_blocks (ip, failed_count, window_started_at, blocked_until, last_email)
         VALUES (?, 1, NOW(), NULL, ?)
         ON DUPLICATE KEY UPDATE
           failed_count = CASE
             WHEN blocked_until IS NOT NULL AND blocked_until > NOW() THEN failed_count
             WHEN (blocked_until IS NOT NULL AND blocked_until <= NOW())
                  OR window_started_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE) THEN 1
             ELSE failed_count + 1 END,
           window_started_at = CASE
             WHEN blocked_until IS NOT NULL AND blocked_until > NOW() THEN window_started_at
             WHEN (blocked_until IS NOT NULL AND blocked_until <= NOW())
                  OR window_started_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE) THEN NOW()
             ELSE window_started_at END,
           blocked_until = CASE
             WHEN blocked_until IS NOT NULL AND blocked_until > NOW() THEN blocked_until
             WHEN failed_count >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
             ELSE NULL END,
           last_email = ?`,
                [ip, safeEmail, cfg.windowMinutes, cfg.windowMinutes, cfg.maxAttempts, cfg.lockMinutes, safeEmail],
            );
            const rows: Array<{ a: number | string; s: number | string | null }> = await this.repo.query(
                `SELECT failed_count AS a,
                IF(blocked_until IS NOT NULL AND blocked_until > NOW(), TIMESTAMPDIFF(SECOND, NOW(), blocked_until), 0) AS s
         FROM login_ip_blocks WHERE ip = ?`,
                [ip],
            );
            const attempts = Number(rows[0]?.a ?? 0);
            const lockedSeconds = Math.max(Number(rows[0]?.s ?? 0), 0);
            if (lockedSeconds > 0 && attempts >= cfg.maxAttempts) {
                this.logger.warn(`[SECURITY] IP ${ip} bị khoá đăng nhập ${cfg.lockMinutes} phút do sai ${attempts} lần`);
            }
            return { attempts, lockedSeconds };
        } catch (err) {
            this.logger.error('Không ghi được login_ip_blocks - bỏ qua khoá IP', err instanceof Error ? err.stack : undefined);
            return { attempts: 0, lockedSeconds: 0 };
        }
    }

    /** Danh sách IP đang khoá + có hoạt động sai trong 24 giờ gần đây (tối đa 200 dòng, mới nhất trước). */
    async list(): Promise<IpBlockRow[]> {
        const rows: Array<Record<string, any>> = await this.repo.query(
            `SELECT id, ip, failed_count, last_email, window_started_at, updated_at,
              IF(blocked_until IS NOT NULL AND blocked_until > NOW(), TIMESTAMPDIFF(SECOND, NOW(), blocked_until), 0) AS locked_seconds
       FROM login_ip_blocks
       WHERE (blocked_until IS NOT NULL AND blocked_until > NOW())
          OR updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY (blocked_until IS NOT NULL AND blocked_until > NOW()) DESC, updated_at DESC
       LIMIT 200`,
        );
        return rows.map((r) => ({
            id: Number(r.id),
            ip: String(r.ip),
            failedCount: Number(r.failed_count),
            lastEmail: r.last_email ?? null,
            lockedSeconds: Math.max(Number(r.locked_seconds ?? 0), 0),
            windowStartedAt: r.window_started_at,
            updatedAt: r.updated_at,
        }));
    }

    /** Mở khoá 1 IP = xoá dòng (bộ đếm + khoá về 0). Trả `null` nếu không có dòng; ngược lại thông tin dòng đã xoá. */
    async unblock(rawIp: string): Promise<{ id: number; ip: string; failedCount: number; wasLocked: boolean } | null> {
        const ip = normalizeIp(rawIp);
        if (!ip) return null;
        const rows: Array<Record<string, any>> = await this.repo.query(
            `SELECT id, ip, failed_count,
              (blocked_until IS NOT NULL AND blocked_until > NOW()) AS locked
       FROM login_ip_blocks WHERE ip = ?`,
            [ip],
        );
        if (rows.length === 0) return null;
        await this.repo.query(`DELETE FROM login_ip_blocks WHERE ip = ?`, [ip]);
        return {
            id: Number(rows[0].id),
            ip: String(rows[0].ip),
            failedCount: Number(rows[0].failed_count),
            wasLocked: Number(rows[0].locked) === 1,
        };
    }
}