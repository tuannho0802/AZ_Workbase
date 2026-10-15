import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpGeoCache } from '../../database/entities/ip-geo-cache.entity';
import { normalizeIp } from './client-ip';

export type IpKind = 'public' | 'private';
export interface IpGeoInfo {
    countryCode: string | null;
    ipKind: IpKind;
    /** 'manual' = Admin sửa tay (FE hiện chấm nhỏ). */
    source: 'vercel' | 'manual' | 'private' | 'unknown' | null;
    updatedByName?: string | null;
}

/** IP mạng nội bộ / loopback / link-local (IPv4 + IPv6) - không thuộc quốc gia nào. */
export function isPrivateIp(raw: string | null | undefined): boolean {
    const ip = normalizeIp(raw);
    if (!ip) return false;
    if (ip.includes(':')) {
        return ip === '::1' || /^f[cd][0-9a-f]{2}:/.test(ip) || /^fe[89ab][0-9a-f]:/.test(ip);
    }
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

/** Mã ISO-3166 alpha-2 hợp lệ (dùng Intl, không thêm dependency). */
export function isValidCountryCode(code: unknown): code is string {
    if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return false;
    // Mã ISO "user-assigned" (AA, QM–QZ, XA–XZ, ZZ) không phải quốc gia thật.
    if (code === 'AA' || code === 'ZZ' || /^X[A-Z]$/.test(code) || /^Q[M-Z]$/.test(code)) return false;
    try {
        const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
        return !!name && name !== code;
    } catch {
        return false;
    }
}

/**
 * P3.6 — quốc gia của IP. KHÔNG tra cứu ngoài: chỉ dùng header Vercel (ghi cache khi login/refresh) + Admin sửa tay.
 * Dòng `source = 'manual'` KHÔNG bao giờ bị header Vercel ghi đè.
 */
@Injectable()
export class IpGeoService {
    private readonly logger = new Logger(IpGeoService.name);

    constructor(@InjectRepository(IpGeoCache) private readonly repo: Repository<IpGeoCache>) { }

    /** Ghi/cập nhật quốc gia lấy từ header. Lỗi chỉ log - không bao giờ làm hỏng đăng nhập. */
    async record(ip: string | null, countryCode: string | null): Promise<void> {
        const n = normalizeIp(ip);
        if (!n) return;
        try {
            if (isPrivateIp(n)) {
                await this.repo.query(
                    `INSERT INTO ip_geo_cache (ip, country_code, source, resolved_at) VALUES (?, NULL, 'private', NOW())
           ON DUPLICATE KEY UPDATE source = IF(source = 'manual', source, 'private'), country_code = IF(source = 'manual', country_code, NULL)`,
                    [n],
                );
                return;
            }
            if (!countryCode) return; // không có header: không ghi đè dữ liệu cũ
            await this.repo.query(
                `INSERT INTO ip_geo_cache (ip, country_code, source, resolved_at) VALUES (?, ?, 'vercel', NOW())
         ON DUPLICATE KEY UPDATE
           country_code = IF(source = 'manual', country_code, VALUES(country_code)),
           source = IF(source = 'manual', source, 'vercel'),
           resolved_at = IF(source = 'manual', resolved_at, NOW())`,
                [n, countryCode],
            );
        } catch (err) {
            this.logger.warn(`Không ghi được ip_geo_cache: ${err instanceof Error ? err.message : 'lỗi không rõ'}`);
        }
    }

    /** 1 query `IN (...)` cho cả trang (không N+1). IP không có trong cache -> `countryCode = null`. */
    async resolveMany(ips: Array<string | null | undefined>): Promise<Map<string, IpGeoInfo>> {
        const out = new Map<string, IpGeoInfo>();
        const uniq = [...new Set(ips.map((i) => normalizeIp(i)).filter((i): i is string => !!i))];
        if (uniq.length === 0) return out;
        let rows: Array<{ ip: string; country_code: string | null; source: IpGeoInfo['source']; updated_by_name: string | null }> = [];
        try {
            rows =
                (await this.repo.query(
                    `SELECT g.ip, g.country_code, g.source, u.name AS updated_by_name
           FROM ip_geo_cache g LEFT JOIN users u ON u.id = g.updated_by
           WHERE g.ip IN (${uniq.map(() => '?').join(',')})`,
                    uniq,
                )) ?? [];
        } catch (err) {
            this.logger.warn(`Không đọc được ip_geo_cache (đã chạy migration chưa?): ${err instanceof Error ? err.message : ''}`);
        }
        const byIp = new Map(rows.map((r) => [String(r.ip), r]));
        for (const ip of uniq) {
            const priv = isPrivateIp(ip);
            const r = byIp.get(ip);
            out.set(ip, {
                countryCode: priv ? null : r?.country_code ?? null,
                ipKind: priv ? 'private' : 'public',
                source: r?.source ?? (priv ? 'private' : null),
                updatedByName: r?.source === 'manual' ? r.updated_by_name ?? null : null,
            });
        }
        return out;
    }

    /** Gắn `countryCode` + `ipKind` (+ `geoSource`) cạnh field IP của từng dòng. 1 query cho cả danh sách. */
    async enrich<T extends Record<string, any>>(rows: T[], ipField: string, prefix = ''): Promise<Array<T & Record<string, any>>> {
        const map = await this.resolveMany(rows.map((r) => r[ipField]));
        const key = (s: string) => (prefix ? prefix + s.charAt(0).toUpperCase() + s.slice(1) : s);
        return rows.map((r) => {
            const g = map.get(normalizeIp(r[ipField]) ?? '');
            return {
                ...r,
                [key('countryCode')]: g?.countryCode ?? null,
                [key('ipKind')]: g?.ipKind ?? 'public',
                [key('geoSource')]: g?.source ?? null,
            };
        });
    }

    /** Admin gán quốc gia thủ công. IP nội bộ / mã sai -> 400. Trả giá trị cũ để ghi audit. */
    async setManual(ipRaw: string, countryCodeRaw: string, adminId: number): Promise<{ ip: string; before: string | null; after: string }> {
        const ip = normalizeIp(ipRaw);
        if (!ip) throw new BadRequestException('Địa chỉ IP không hợp lệ');
        if (isPrivateIp(ip)) throw new BadRequestException('IP mạng nội bộ không thuộc quốc gia nào, không thể gán quốc gia.');
        const code = typeof countryCodeRaw === 'string' ? countryCodeRaw.trim().toUpperCase() : '';
        if (!isValidCountryCode(code)) throw new BadRequestException('Mã quốc gia không hợp lệ (cần ISO-3166 alpha-2, vd VN)');
        const [prev] = (await this.repo.query(`SELECT country_code FROM ip_geo_cache WHERE ip = ?`, [ip])) ?? [];
        await this.repo.query(
            `INSERT INTO ip_geo_cache (ip, country_code, source, resolved_at, updated_by) VALUES (?, ?, 'manual', NOW(), ?)
       ON DUPLICATE KEY UPDATE country_code = VALUES(country_code), source = 'manual', resolved_at = NOW(), updated_by = VALUES(updated_by)`,
            [ip, code, adminId],
        );
        return { ip, before: prev?.country_code ?? null, after: code };
    }

    /** Xoá bản sửa tay (quay về dữ liệu Vercel/N/A). Trả `null` nếu không có bản sửa tay. */
    async clearManual(ipRaw: string): Promise<{ ip: string; before: string | null } | null> {
        const ip = normalizeIp(ipRaw);
        if (!ip) throw new BadRequestException('Địa chỉ IP không hợp lệ');
        const [prev] = (await this.repo.query(`SELECT country_code FROM ip_geo_cache WHERE ip = ? AND source = 'manual'`, [ip])) ?? [];
        if (!prev) return null;
        await this.repo.query(`DELETE FROM ip_geo_cache WHERE ip = ? AND source = 'manual'`, [ip]);
        return { ip, before: prev.country_code ?? null };
    }
}