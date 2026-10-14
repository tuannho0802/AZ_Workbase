import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { SECURITY_AUDIT_ACTIONS } from './security-audit';
import { GetSecurityEventsDto } from './dto/security-activity.dto';

/** Chênh lệch giờ VN so với UTC: cột `created_at` do DB tự sinh theo UTC (cùng quy ước `report-range.util.ts`). */
const VN_OFFSET_HOURS = 7;

export interface SecuritySummary {
  /** Số lần KHOÁ (tài khoản + IP) từ 00:00 hôm nay (giờ VN). */
  lockedToday: number;
  /** Số lần đăng nhập SAI (kể cả email lạ) từ 00:00 hôm nay (giờ VN). */
  failedToday: number;
  /** Số IP đang bị khoá lúc này. */
  blockedIpsNow: number;
  /** Email chưa có trong hệ thống bị thử nhiều nhất trong 7 ngày. */
  topUnknownEmails: Array<{ email: string; count: number }>;
}

/** Trang "Hoạt động bảo mật" (PLAN Phase 4.3): truy vấn sự kiện + thẻ tổng hợp. Chỉ đọc. */
@Injectable()
export class SecurityActivityService {
  constructor(@InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>) {}

  /** `YYYY-MM-DD` (ngày VN) -> mốc UTC dạng chuỗi cho so sánh với `created_at`. `endExclusive` = 00:00 ngày kế tiếp. */
  private vnDayBoundUtc(date: string, endExclusive: boolean): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCHours(d.getUTCHours() - VN_OFFSET_HOURS + (endExclusive ? 24 : 0));
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  async listEvents(f: GetSecurityEventsDto) {
    const page = f.page ?? 1;
    const limit = f.limit ?? 20;
    const qb = this.auditRepo
      .createQueryBuilder('log')
      .select(['log.id', 'log.userId', 'log.action', 'log.ipAddress', 'log.userAgent', 'log.newData', 'log.createdAt'])
      .leftJoin('log.user', 'user')
      .addSelect(['user.id', 'user.name', 'user.email'])
      .where('log.action IN (:...actions)', { actions: f.action ? [f.action] : [...SECURITY_AUDIT_ACTIONS] })
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC');

    if (f.ip?.trim()) {
      // Khớp theo TIỀN TỐ (dùng được index; không cho ký tự đại diện của người dùng lọt vào).
      qb.andWhere('log.ipAddress LIKE :ip', { ip: `${f.ip.trim().replace(/[%_\\]/g, '')}%` });
    }
    if (f.search?.trim()) {
      const like = `%${f.search.trim().replace(/[%_\\]/g, '')}%`;
      qb.andWhere(
        `(JSON_UNQUOTE(JSON_EXTRACT(log.newData, '$.email')) LIKE :like OR user.email LIKE :like OR user.name LIKE :like)`,
        { like },
      );
    }
    if (f.fromDate) qb.andWhere('log.createdAt >= :from', { from: this.vnDayBoundUtc(f.fromDate, false) });
    if (f.toDate) qb.andWhere('log.createdAt < :to', { to: this.vnDayBoundUtc(f.toDate, true) });

    const [data, total] = await qb
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();
    return { data, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) };
  }

  async summary(): Promise<SecuritySummary> {
    const actions = (names: string[]) => names.map(() => '?').join(',');
    const todayStartUtc = `DATE_SUB(DATE(DATE_ADD(NOW(), INTERVAL ${VN_OFFSET_HOURS} HOUR)), INTERVAL ${VN_OFFSET_HOURS} HOUR)`;
    const LOCKS = ['ACCOUNT_LOCKED', 'LOGIN_IP_BLOCKED'];
    const FAILS = ['LOGIN_FAILED', 'LOGIN_UNKNOWN_EMAIL'];

    const [counts, blocked, tops] = await Promise.all([
      this.auditRepo.query(
        `SELECT
           SUM(action IN (${actions(LOCKS)})) AS locked,
           SUM(action IN (${actions(FAILS)})) AS failed
         FROM audit_logs
         WHERE created_at >= ${todayStartUtc} AND action IN (${actions([...LOCKS, ...FAILS])})`,
        [...LOCKS, ...FAILS, ...LOCKS, ...FAILS],
      ) as Promise<Array<{ locked: string | null; failed: string | null }>>,
      this.auditRepo
        .query(`SELECT COUNT(*) AS c FROM login_ip_blocks WHERE blocked_until IS NOT NULL AND blocked_until > NOW()`)
        .catch(() => [{ c: 0 }]) as Promise<Array<{ c: string | number }>>,
      this.auditRepo.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(new_data, '$.email')) AS email, COUNT(*) AS c
         FROM audit_logs
         WHERE action = 'LOGIN_UNKNOWN_EMAIL' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
           AND JSON_EXTRACT(new_data, '$.email') IS NOT NULL
         GROUP BY email ORDER BY c DESC LIMIT 5`,
      ) as Promise<Array<{ email: string | null; c: string | number }>>,
    ]);

    return {
      lockedToday: Number(counts?.[0]?.locked ?? 0),
      failedToday: Number(counts?.[0]?.failed ?? 0),
      blockedIpsNow: Number(blocked?.[0]?.c ?? 0),
      topUnknownEmails: (tops ?? [])
        .filter((r) => r.email)
        .map((r) => ({ email: String(r.email), count: Number(r.c) })),
    };
  }
}
