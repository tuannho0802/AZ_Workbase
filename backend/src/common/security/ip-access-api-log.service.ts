import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpAccessStats } from '../../database/entities/ip-access-stats.entity';
import { normalizeIp } from './client-ip';
import { IpGeoService } from './ip-geo.service';
import { LoginIpBlacklistService } from './login-ip-blacklist.service';
import { LoginIpBlockService } from './login-ip-block.service';
import { LoginIpWhitelistService } from './login-ip-whitelist.service';
import { SecurityConfigService } from './security-config.service';
import type { IpAccessStatus } from './ip-access-log.service';
import { registerCacheProbe } from '../utils/cache-probe-registry';

export interface ApiHitInput {
    ip: string | null;
    countryCode: string | null;
    userId: number;
    /** Tên controller dạng kebab-case, vd `customers`, `link-groups`. */
    endpointGroup: string;
    /** Route MẪU (`GET /customers/:id`) — KHÔNG BAO GIỜ là URL thô/query/giá trị id. */
    endpoint: string;
    status: number | null;
    userAgent: string | null;
}

interface BucketState {
    minute: number;
    /** Số request đã thấy trong thùng NHƯNG chưa ghi DB (ghi dồn khi sang thùng mới). */
    pending: number;
    lastStatus: number | null;
}

/** Giới hạn số khoá thùng giữ trong RAM của 1 instance (chống phình bộ nhớ). */
export const API_BUCKET_CACHE_MAX = 5000;
/** Trạng thái IP (whitelist/khoá) chỉ tra lại sau ngần này ms — tránh query mỗi thùng. */
export const API_IP_STATUS_TTL_MS = 60_000;
/** Cờ quốc gia chỉ ghi lại `ip_geo_cache` sau ngần này ms cho cùng 1 IP. */
export const API_GEO_RECORD_TTL_MS = 10 * 60_000;

/**
 * P3.6 mục 3.6.2 — log request API đã đăng nhập, GOM THEO THÙNG 1 PHÚT `(ip, user_id, endpoint_group, phút)`.
 *
 * Chỉ request ĐẦU TIÊN của thùng (trong 1 instance) chạm DB; các request sau cộng vào RAM (`pending`) và được ghi dồn
 * khi thùng đó đã qua. Vì vậy `hit_count`/`api_hits` là SỐ XẤP XỈ (có thể thấp hơn thật khi instance bị dừng hoặc
 * RAM bị dọn) — UI phải ghi rõ. Đếm `login`/`refresh` vẫn chính xác (đi đường `IpAccessLogService.record`).
 *
 * Dòng chi tiết có cap riêng (`api_window_*`, cùng giá trị `ip_access_detail_cap_per_hour`) và KHÔNG dùng chung cửa sổ
 * của login/refresh: request API không bao giờ làm mất dòng đăng nhập thất bại. Bộ đếm `ip_access_stats` thì luôn cộng.
 * Mọi lỗi bị nuốt: log KHÔNG BAO GIỜ làm hỏng request.
 */
@Injectable()
export class IpAccessApiLogService {
    private readonly logger = new Logger(IpAccessApiLogService.name);
    private readonly buckets = new Map<string, BucketState>();
    private readonly ipStatusCache = new Map<string, { status: IpAccessStatus; expiresAt: number }>();
    private readonly cacheProbeKey = registerCacheProbe({ key: 'ip_access_status', label: 'Trạng thái IP (log request API)', ttlSeconds: API_IP_STATUS_TTL_MS / 1000, size: () => this.ipStatusCache.size });
    private readonly geoRecorded = new Map<string, number>();

    constructor(
        @InjectRepository(IpAccessStats) private readonly repo: Repository<IpAccessStats>,
        private readonly config: SecurityConfigService,
        private readonly ipGeo: IpGeoService,
        private readonly whitelist: LoginIpWhitelistService,
        private readonly blacklist: LoginIpBlacklistService,
        private readonly blocks: LoginIpBlockService,
    ) { }

    /** Dùng trong test: số khoá thùng đang giữ. */
    get bucketCount(): number {
        return this.buckets.size;
    }

    async record(input: ApiHitInput): Promise<void> {
        try {
            const ip = normalizeIp(input.ip);
            if (!ip || !Number.isInteger(input.userId) || !input.endpointGroup) return;

            const minute = Math.floor(Date.now() / 60_000);
            const key = `${ip}|${input.userId}|${input.endpointGroup}`;
            const prev = this.buckets.get(key);
            if (prev && prev.minute === minute) {
                prev.pending += 1; // cùng thùng: chỉ đếm trong RAM, KHÔNG chạm DB
                prev.lastStatus = input.status;
                return;
            }

            // Đặt khoá TRƯỚC mọi `await` để request song song cùng thùng không cùng ghi DB.
            this.buckets.set(key, { minute, pending: 0, lastStatus: input.status });
            this.evictIfNeeded(minute);

            const cfg = await this.config.get();
            if (!cfg.ipAccessLogApiEnabled) return;

            const cap = cfg.ipAccessDetailCapPerHour;
            const carried = prev && prev.pending > 0 ? prev.pending : 0;
            const ipStatus = await this.resolveIpStatus(ip);

            // 1) Bộ đếm: luôn cộng (1 upsert nguyên tử, đồng hồ DB). Thứ tự gán cột QUAN TRỌNG (xem IpAccessLogService.record):
            //    api_window_count -> api_window_started_at -> suppressed_hits (thấy giá trị MỚI của api_window_count).
            await this.repo.query(
                `INSERT INTO ip_access_stats
           (ip, total_hits, api_hits, first_seen_at, last_seen_at, last_outcome, last_country_code, api_window_started_at, api_window_count)
         VALUES (?, ?, ?, NOW(), NOW(), 'api', ?, NOW(), 1)
         ON DUPLICATE KEY UPDATE
           total_hits = total_hits + VALUES(total_hits),
           api_hits = api_hits + VALUES(api_hits),
           api_window_count = IF(api_window_started_at IS NULL OR api_window_started_at < (NOW() - INTERVAL 1 HOUR), 1, api_window_count + 1),
           api_window_started_at = IF(api_window_started_at IS NULL OR api_window_started_at < (NOW() - INTERVAL 1 HOUR), NOW(), api_window_started_at),
           suppressed_hits = suppressed_hits + IF(api_window_count > ?, 1, 0),
           last_seen_at = NOW(),
           last_outcome = 'api',
           last_country_code = COALESCE(VALUES(last_country_code), last_country_code)`,
                [ip, 1 + carried, 1 + carried, input.countryCode, cap],
            );

            // 2) Dòng chi tiết của thùng (chỉ khi chưa vượt cap API/giờ của IP). Cùng thùng ở instance khác -> cộng hit_count.
            await this.repo.query(
                `INSERT INTO ip_access_logs
           (ip, country_code, endpoint, endpoint_group, outcome, ip_status, user_id, user_agent, hit_count, bucket_minute, last_status, created_at)
         SELECT ?, ?, ?, ?, 'api', ?, ?, ?, 1, DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00'), ?, NOW()
           FROM ip_access_stats WHERE ip = ? AND api_window_count <= ?
         ON DUPLICATE KEY UPDATE hit_count = hit_count + 1, last_status = VALUES(last_status)`,
                [ip, input.countryCode, input.endpoint.slice(0, 80), input.endpointGroup.slice(0, 60), ipStatus, input.userId,
                    input.userAgent ? input.userAgent.slice(0, 255) : null, input.status, ip, cap],
            );

            // 3) Ghi dồn số request còn treo của thùng TRƯỚC vào đúng dòng của nó (nếu dòng đó có tồn tại).
            if (carried > 0 && prev) {
                await this.repo.query(
                    `UPDATE ip_access_logs SET hit_count = hit_count + ?, last_status = COALESCE(?, last_status)
            WHERE ip = ? AND user_id = ? AND endpoint_group = ?
              AND bucket_minute = DATE_FORMAT(NOW() - INTERVAL ? MINUTE, '%Y-%m-%d %H:%i:00')`,
                    [carried, prev.lastStatus, ip, input.userId, input.endpointGroup, Math.max(1, minute - prev.minute)],
                );
            }

            // 4) Cờ quốc gia: không ghi lại mỗi thùng (cache RAM 10 phút/IP).
            await this.recordGeoOnce(ip, input.countryCode);
        } catch (err) {
            this.logger.warn(`Không ghi được log request API: ${err instanceof Error ? err.message : 'lỗi không rõ'}`);
        }
    }

    /** whitelist -> 'whitelisted'; blacklist/khoá IP -> 'blocked'; còn lại 'normal'. Cache RAM 60 giây/IP. */
    private async resolveIpStatus(ip: string): Promise<IpAccessStatus> {
        const now = Date.now();
        const hit = this.ipStatusCache.get(ip);
        if (hit && hit.expiresAt > now) return hit.status;
        let status: IpAccessStatus = 'normal';
        if (await this.blacklist.isBanned(ip)) status = 'blocked';
        else if (await this.whitelist.isWhitelisted(ip)) status = 'whitelisted';
        else if ((await this.blocks.getRemainingSeconds(ip)) > 0) status = 'blocked';
        if (this.ipStatusCache.size >= API_BUCKET_CACHE_MAX) this.ipStatusCache.clear();
        this.ipStatusCache.set(ip, { status, expiresAt: now + API_IP_STATUS_TTL_MS });
        return status;
    }

    private async recordGeoOnce(ip: string, countryCode: string | null): Promise<void> {
        const now = Date.now();
        const last = this.geoRecorded.get(ip);
        if (last && now - last < API_GEO_RECORD_TTL_MS) return;
        if (this.geoRecorded.size >= API_BUCKET_CACHE_MAX) this.geoRecorded.clear();
        this.geoRecorded.set(ip, now);
        await this.ipGeo.record(ip, countryCode);
    }

    /** Dọn khoá thùng cũ khi RAM vượt giới hạn (số request treo của khoá bị dọn bị bỏ — đúng tính chất xấp xỉ). */
    private evictIfNeeded(currentMinute: number): void {
        if (this.buckets.size <= API_BUCKET_CACHE_MAX) return;
        for (const [k, v] of this.buckets) {
            if (v.minute < currentMinute - 1) this.buckets.delete(k);
        }
        if (this.buckets.size > API_BUCKET_CACHE_MAX) {
            let n = Math.floor(API_BUCKET_CACHE_MAX / 5);
            for (const k of this.buckets.keys()) {
                this.buckets.delete(k);
                if (--n <= 0) break;
            }
        }
    }
}