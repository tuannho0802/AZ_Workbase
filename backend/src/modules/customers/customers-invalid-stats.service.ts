import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { todayVnStr, toVnDateStr } from '../../common/utils/date-vn.util';
import { CustomerAccessHelper } from './helpers/customer-access.helper';

export const STATS_DEFAULT_DAYS = 30;
export const STATS_MIN_DAYS = 7;
export const STATS_MAX_DAYS = 90;
/** Số phần tử tối đa của các bảng/biểu đồ xếp hạng (Top người tạo, Top cụm trùng). */
export const STATS_TOP_N = 10;
/** Chia nhỏ danh sách giá trị trùng khi `IN (...)` để không vượt giới hạn placeholder của MySQL. */
const KEY_CHUNK_SIZE = 1000;

export type DuplicateStatsType = 'duplicate_phone' | 'duplicate_email';

export interface DuplicateOverviewItem {
  /** Số khách hàng nằm trong các cụm trùng. */
  customers: number;
  /** Số GIÁ TRỊ (SĐT/Email) đang bị trùng = số cụm trùng. */
  groups: number;
}

export interface InvalidDataOverview {
  /** Tổng khách hàng (chưa xoá, trong phạm vi quyền xem) - mẫu số cho các tỷ lệ. */
  totalCustomers: number;
  future_date: number;
  missing_phone: number;
  missing_email: number;
  duplicate_phone: DuplicateOverviewItem;
  duplicate_email: DuplicateOverviewItem;
}

export interface DuplicateStatsDetail {
  /** Tổng khách hàng CÓ giá trị (SĐT/Email) khác rỗng - mẫu số của `duplicateRatePercent`. */
  totalWithValue: number;
  /** Số khách hàng nằm trong cụm trùng (gồm cả bản gốc). */
  affectedCustomers: number;
  /** Số cụm trùng (số giá trị bị lặp). */
  groupCount: number;
  /** Số bản ghi "dư" cần gộp/xoá = affectedCustomers - groupCount (mỗi cụm giữ lại 1 bản gốc). */
  redundantCount: number;
  /** % affectedCustomers / totalWithValue, làm tròn 1 số lẻ. `null` nếu totalWithValue = 0. */
  duplicateRatePercent: number | null;
  maxGroupSize: number;
  /** Cụm có ≥ 2 Sales phụ trách KHÁC NHAU - nguy cơ 2 Sales cùng chăm 1 khách (nghiêm trọng nhất). */
  crossSalesGroups: number;
  /** Cụm còn lại (≤ 1 Sales phụ trách) - trùng nội bộ / chưa gán Sales. */
  sameSalesGroups: number;
  sizeDistribution: Array<{ label: string; groups: number }>;
  /** Số bản ghi trùng (bản nhập SAU bản gốc) phát sinh theo ngày, đủ `days` ngày liên tục (ngày không có = 0). */
  trend: Array<{ date: string; redundant: number }>;
  /** Người nhập ra nhiều bản ghi trùng nhất (tính trên bản nhập sau bản gốc của mỗi cụm). */
  topCreators: Array<{ userId: number; name: string; redundantCount: number }>;
  /** Cụm trùng lớn nhất (nhiều bản ghi nhất) - để rà soát/drill-down. */
  topGroups: Array<{
    key: string;
    size: number;
    distinctSales: number;
    salesNames: string[];
    latestCreatedAt: string;
  }>;
}

export interface InvalidDataStatsResult {
  generatedAt: string;
  invalidType: string;
  days: number;
  overview: InvalidDataOverview;
  /** `null` khi `invalidType` không phải loại trùng lặp (chỉ trả tổng quan). */
  duplicate: DuplicateStatsDetail | null;
}

interface DupRow {
  id: number;
  key: string;
  salesUserId: number | null;
  createdById: number | null;
  createdAt: Date;
}

/** Cộng `delta` ngày vào chuỗi 'YYYY-MM-DD' (tính theo UTC, không phụ thuộc timezone máy chủ). */
export function shiftDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/**
 * CustomersInvalidStatsService - "Thống kê data lỗi" cho tab Thống kê của trang
 * /customers/reports/invalid-data.
 *
 * Thiết kế (rút từ thực hành dashboard chất lượng dữ liệu): KPI tỷ lệ trùng +
 * số cụm/bản ghi dư, mức độ nghiêm trọng (trùng KHÁC Sales), xu hướng theo
 * ngày (phát hiện đợt nhập/import gây trùng), người gây trùng nhiều nhất và
 * danh sách cụm lớn nhất để drill-down xử lý.
 *
 * Quy ước cụm trùng: giống hệt `getDuplicateContactReport()` - SĐT dùng nguyên
 * văn, Email dùng LOWER(TRIM()). Trong mỗi cụm, bản ghi tạo SỚM NHẤT là "bản
 * gốc", các bản còn lại là bản "dư" (redundant) - dùng để quy trách nhiệm
 * "ai nhập trùng" và vẽ xu hướng theo ngày.
 *
 * Phạm vi xem: MỌI truy vấn đều qua `CustomerAccessHelper.applyViewFilter`
 * (cùng `customers.invalid_report` + scope như báo cáo danh sách) - không rò
 * rỉ cụm trùng dựa trên khách ngoài quyền xem.
 */
@Injectable()
export class CustomersInvalidStatsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private static groupExpr(isEmail: boolean) {
    return isEmail ? 'LOWER(TRIM(customer.email))' : 'customer.phone';
  }

  private static nonEmptyCondition(isEmail: boolean) {
    return isEmail
      ? "customer.email IS NOT NULL AND TRIM(customer.email) != ''"
      : "customer.phone IS NOT NULL AND customer.phone != ''";
  }

  /** Các giá trị (SĐT/Email) đang trùng kèm số bản ghi mỗi cụm. */
  private async loadDuplicateKeyCounts(
    isEmail: boolean,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<Array<{ key: string; cnt: number }>> {
    const expr = CustomersInvalidStatsService.groupExpr(isEmail);
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .select(expr, 'dupKey')
      .addSelect('COUNT(*)', 'cnt')
      .where('customer.deletedAt IS NULL')
      .andWhere(CustomersInvalidStatsService.nonEmptyCondition(isEmail));
    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);
    qb.groupBy(expr).having('COUNT(*) > 1');
    const rows = await qb.getRawMany<{ dupKey: string; cnt: string | number }>();
    return rows.filter((r) => !!r.dupKey).map((r) => ({ key: r.dupKey, cnt: Number(r.cnt) }));
  }

  private async countTotalWithValue(isEmail: boolean, userId: number, userRole: string, scope?: string | null) {
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .where('customer.deletedAt IS NULL')
      .andWhere(CustomersInvalidStatsService.nonEmptyCondition(isEmail));
    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);
    return qb.getCount();
  }

  async getStats(
    userId: number,
    userRole: string,
    scope?: string | null,
    invalidType: string = 'duplicate_phone',
    daysInput?: number,
  ): Promise<InvalidDataStatsResult> {
    const days = Math.min(
      STATS_MAX_DAYS,
      Math.max(STATS_MIN_DAYS, Number.isFinite(daysInput) ? Math.floor(daysInput as number) : STATS_DEFAULT_DAYS),
    );
    const today = todayVnStr();

    const baseCount = () => {
      const qb = this.customerRepo.createQueryBuilder('customer').where('customer.deletedAt IS NULL');
      CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);
      return qb;
    };

    const [totalCustomers, futureDate, missingPhone, missingEmail, dupPhoneKeys, dupEmailKeys] = await Promise.all([
      baseCount().getCount(),
      baseCount().andWhere('customer.inputDate > :statsToday', { statsToday: today }).getCount(),
      baseCount().andWhere("(customer.phone IS NULL OR customer.phone = '')").getCount(),
      baseCount().andWhere("(customer.email IS NULL OR customer.email = '')").getCount(),
      this.loadDuplicateKeyCounts(false, userId, userRole, scope),
      this.loadDuplicateKeyCounts(true, userId, userRole, scope),
    ]);

    const toOverview = (keys: Array<{ cnt: number }>): DuplicateOverviewItem => ({
      groups: keys.length,
      customers: keys.reduce((s, k) => s + k.cnt, 0),
    });

    const overview: InvalidDataOverview = {
      totalCustomers,
      future_date: futureDate,
      missing_phone: missingPhone,
      missing_email: missingEmail,
      duplicate_phone: toOverview(dupPhoneKeys),
      duplicate_email: toOverview(dupEmailKeys),
    };

    const isDuplicate = invalidType === 'duplicate_phone' || invalidType === 'duplicate_email';
    let duplicate: DuplicateStatsDetail | null = null;
    if (isDuplicate) {
      const isEmail = invalidType === 'duplicate_email';
      duplicate = await this.buildDuplicateDetail(
        isEmail,
        isEmail ? dupEmailKeys : dupPhoneKeys,
        days,
        today,
        userId,
        userRole,
        scope,
      );
    }

    return { generatedAt: today, invalidType, days, overview, duplicate };
  }

  private async buildDuplicateDetail(
    isEmail: boolean,
    keyCounts: Array<{ key: string; cnt: number }>,
    days: number,
    today: string,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<DuplicateStatsDetail> {
    const totalWithValue = await this.countTotalWithValue(isEmail, userId, userRole, scope);

    // Khung trend đủ `days` ngày liên tục (ngày không có bản trùng = 0).
    const trendMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) trendMap.set(shiftDateStr(today, -i), 0);

    const empty: DuplicateStatsDetail = {
      totalWithValue,
      affectedCustomers: 0,
      groupCount: 0,
      redundantCount: 0,
      duplicateRatePercent: totalWithValue > 0 ? 0 : null,
      maxGroupSize: 0,
      crossSalesGroups: 0,
      sameSalesGroups: 0,
      sizeDistribution: [],
      trend: [...trendMap.entries()].map(([date, redundant]) => ({ date, redundant })),
      topCreators: [],
      topGroups: [],
    };
    if (keyCounts.length === 0) return empty;

    // Tải (id, key, sales, người tạo, ngày tạo) của mọi khách nằm trong cụm trùng.
    const expr = CustomersInvalidStatsService.groupExpr(isEmail);
    const allKeys = keyCounts.map((k) => k.key);
    const rows: DupRow[] = [];
    for (let i = 0; i < allKeys.length; i += KEY_CHUNK_SIZE) {
      const chunk = allKeys.slice(i, i + KEY_CHUNK_SIZE);
      const qb = this.customerRepo
        .createQueryBuilder('customer')
        .select('customer.id', 'id')
        .addSelect(expr, 'dup_key')
        .addSelect('customer.salesUserId', 'sales_user_id')
        .addSelect('customer.createdById', 'created_by_id')
        .addSelect('customer.createdAt', 'created_at')
        .where('customer.deletedAt IS NULL')
        .andWhere(`${expr} IN (:...statsKeys)`, { statsKeys: chunk });
      CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);
      const raw = await qb.getRawMany<{
        id: number | string;
        dup_key: string;
        sales_user_id: number | string | null;
        created_by_id: number | string | null;
        created_at: Date | string;
      }>();
      for (const r of raw) {
        rows.push({
          id: Number(r.id),
          key: r.dup_key,
          salesUserId: r.sales_user_id == null ? null : Number(r.sales_user_id),
          createdById: r.created_by_id == null ? null : Number(r.created_by_id),
          createdAt: new Date(r.created_at),
        });
      }
    }

    const byKey = new Map<string, DupRow[]>();
    for (const r of rows) {
      const arr = byKey.get(r.key) ?? [];
      arr.push(r);
      byKey.set(r.key, arr);
    }

    let affectedCustomers = 0;
    let crossSalesGroups = 0;
    let maxGroupSize = 0;
    const sizeBuckets = new Map<string, number>([
      ['2 bản ghi', 0],
      ['3 bản ghi', 0],
      ['4 bản ghi', 0],
      ['5+ bản ghi', 0],
    ]);
    const creatorCounts = new Map<number, number>();
    const groupSummaries: Array<{ key: string; size: number; salesIds: number[]; latest: Date }> = [];

    for (const [key, members] of byKey) {
      if (members.length < 2) continue; // an toàn: cụm bị thu hẹp do phạm vi quyền xem
      members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
      const size = members.length;
      affectedCustomers += size;
      maxGroupSize = Math.max(maxGroupSize, size);

      const bucket = size >= 5 ? '5+ bản ghi' : `${size} bản ghi`;
      sizeBuckets.set(bucket, (sizeBuckets.get(bucket) ?? 0) + 1);

      const salesIds = [...new Set(members.map((m) => m.salesUserId).filter((s): s is number => s != null))];
      if (salesIds.length >= 2) crossSalesGroups += 1;

      // Bản đầu tiên = bản gốc; các bản sau là bản "dư" -> quy trách nhiệm + trend.
      for (const m of members.slice(1)) {
        if (m.createdById != null) creatorCounts.set(m.createdById, (creatorCounts.get(m.createdById) ?? 0) + 1);
        const d = toVnDateStr(m.createdAt);
        if (trendMap.has(d)) trendMap.set(d, (trendMap.get(d) ?? 0) + 1);
      }

      groupSummaries.push({ key, size, salesIds, latest: members[members.length - 1].createdAt });
    }

    const groupCount = groupSummaries.length;
    const redundantCount = affectedCustomers - groupCount;

    const topCreatorEntries = [...creatorCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, STATS_TOP_N);
    const topGroupsRaw = [...groupSummaries]
      .sort((a, b) => b.size - a.size || b.latest.getTime() - a.latest.getTime() || a.key.localeCompare(b.key))
      .slice(0, STATS_TOP_N);

    // Tên người dùng cho Top người tạo + tên Sales của Top cụm (1 query duy nhất).
    const userIds = new Set<number>(topCreatorEntries.map(([id]) => id));
    topGroupsRaw.forEach((g) => g.salesIds.forEach((id) => userIds.add(id)));
    const nameById = new Map<number, string>();
    if (userIds.size > 0) {
      const users = await this.userRepo.find({ where: { id: In([...userIds]) }, select: { id: true, name: true } });
      users.forEach((u) => nameById.set(u.id, u.name));
    }

    return {
      totalWithValue,
      affectedCustomers,
      groupCount,
      redundantCount,
      duplicateRatePercent: totalWithValue > 0 ? Math.round((affectedCustomers / totalWithValue) * 1000) / 10 : null,
      maxGroupSize,
      crossSalesGroups,
      sameSalesGroups: groupCount - crossSalesGroups,
      sizeDistribution: [...sizeBuckets.entries()].map(([label, groups]) => ({ label, groups })),
      trend: [...trendMap.entries()].map(([date, redundant]) => ({ date, redundant })),
      topCreators: topCreatorEntries.map(([id, redundantCount]) => ({
        userId: id,
        name: nameById.get(id) ?? `#${id}`,
        redundantCount,
      })),
      topGroups: topGroupsRaw.map((g) => ({
        key: g.key,
        size: g.size,
        distinctSales: g.salesIds.length,
        salesNames: g.salesIds.slice(0, 3).map((id) => nameById.get(id) ?? `#${id}`),
        latestCreatedAt: g.latest.toISOString(),
      })),
    };
  }
}
