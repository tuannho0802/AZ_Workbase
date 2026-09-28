import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { todayVnStr, toVnDateStr } from '../../common/utils/date-vn.util';
import { CustomerAccessHelper } from './helpers/customer-access.helper';

/** Kỳ tối đa (ngày) khi có đủ 2 mốc - vượt thì tự co `dateFrom` lại. */
export const STATS_MAX_RANGE_DAYS = 366;
/** Số phần tử tối đa của các bảng/biểu đồ xếp hạng (Top người tạo, Top cụm trùng, Top Marketing). */
export const STATS_TOP_N = 10;
/** Số nhóm liên kết tối đa liệt kê ở bảng "Nhóm bị trùng khách" (nhiều nhóm hơn -> chỉ lấy nhóm hay bị trùng nhất). */
export const STATS_TOP_GROUPS = 20;
/** Kỳ ≤ ngưỡng này vẽ theo NGÀY, dài hơn gộp theo THÁNG để biểu đồ đọc được. */
export const STATS_DAY_BUCKET_MAX_SPAN = 92;
/** Chia nhỏ danh sách giá trị khi `IN (...)` để không vượt giới hạn placeholder của MySQL. */
const KEY_CHUNK_SIZE = 1000;
const VN_OFFSET = '+07:00';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DuplicateStatsType = 'duplicate_phone' | 'duplicate_email';
export type StatsGranularity = 'day' | 'month';

export interface DuplicateOverviewItem {
  /** Số bản ghi trùng (bản nhập SAU bản gốc) phát sinh trong kỳ. */
  redundant: number;
  /** Số cụm (SĐT/Email) có bản trùng phát sinh trong kỳ. */
  groups: number;
}

export interface InvalidDataOverview {
  /** Khách hàng NHẬP TRONG KỲ (chưa xoá, trong phạm vi xem) - mẫu số cho các tỷ lệ. */
  totalCustomers: number;
  future_date: number;
  missing_phone: number;
  missing_email: number;
  duplicate_phone: DuplicateOverviewItem;
  duplicate_email: DuplicateOverviewItem;
}

export interface DuplicateStatsDetail {
  /** Khách nhập trong kỳ CÓ giá trị (SĐT/Email) khác rỗng - mẫu số của `duplicateRatePercent`. */
  totalWithValue: number;
  /** Bản ghi trùng phát sinh trong kỳ (mỗi cụm giữ lại 1 bản gốc = bản nhập sớm nhất). */
  redundantCount: number;
  /** Số cụm có bản trùng phát sinh trong kỳ. */
  groupCount: number;
  /** Tổng số khách nằm trong các cụm đó (gồm bản gốc, kể cả nhập ngoài kỳ). */
  affectedCustomers: number;
  /** % redundantCount / totalWithValue, 1 số lẻ. `null` nếu totalWithValue = 0. */
  duplicateRatePercent: number | null;
  /** redundantCount của kỳ liền trước cùng độ dài. `null` khi kỳ không đủ 2 mốc. */
  previousRedundantCount: number | null;
  maxGroupSize: number;
  /** Cụm có ≥ 2 Sales phụ trách KHÁC NHAU - nguy cơ 2 Sales cùng chăm 1 khách. */
  crossSalesGroups: number;
  sameSalesGroups: number;
  /** Cụm có ≥ 2 Marketing (marketingUserId) KHÁC NHAU nhập cùng 1 khách. */
  crossMarketingClusters: number;
  /** Cụm có bản ghi gán Marketing nhưng chỉ 1 người duy nhất. */
  sameMarketingClusters: number;
  /** Cụm mà MỌI bản ghi đều chưa gán Marketing phụ trách. */
  noMarketingClusters: number;
  /**
   * Cụm có các bản ghi "ĐÃ VÀO" (joined = true) trải trên ≥ 2 nhóm liên kết khác nhau -
   * dấu hiệu rõ nhất của nguyên nhân trùng: 1 khách được nhập lại khi vào group mới.
   */
  crossGroupClusters: number;
  /** Cụm chỉ có mặt trong đúng 1 nhóm liên kết (hoặc mọi bản ghi trùng nhóm nhau). */
  singleGroupClusters: number;
  /** Cụm không có bản ghi nào đã vào nhóm liên kết nào. */
  noGroupClusters: number;
  /** Bản dư (trong kỳ) mà bản ghi CHƯA gán Marketing - không quy được trách nhiệm cho ai. */
  unassignedMarketingRedundant: number;
  /** Marketing tạo nhiều bản dư nhất trong kỳ (chỉ tính bản ghi đã gán Marketing). */
  topMarketers: Array<{ userId: number; name: string; redundantCount: number; clusterCount: number }>;
  /** Từng nhóm liên kết: số cụm trùng có ≥ 1 bản ghi đã vào nhóm này + số bản dư (trong kỳ) thuộc nhóm. */
  groupStats: Array<{ groupId: number; name: string; clusterCount: number; redundantCount: number }>;
  /** Cặp nhóm hay "dính" cùng 1 cụm trùng nhất - gợi ý 2 nhóm hay được Marketing nhập trùng khách qua lại. */
  groupPairs: Array<{ groupAId: number; groupAName: string; groupBId: number; groupBName: string; clusterCount: number }>;
  sizeDistribution: Array<{ label: string; groups: number }>;
  /** Bản ghi trùng phát sinh theo NGÀY (hoặc THÁNG - xem `period.granularity`); `date` = 'YYYY-MM-DD' | 'YYYY-MM'. */
  trend: Array<{ date: string; redundant: number }>;
  topCreators: Array<{ userId: number; name: string; redundantCount: number }>;
  topGroups: Array<{
    key: string;
    size: number;
    /** Số bản trùng của cụm này phát sinh trong kỳ. */
    newInPeriod: number;
    distinctSales: number;
    salesNames: string[];
    /** Số Marketing (marketingUserId) khác nhau đã nhập vào cụm này. */
    distinctMarketing: number;
    marketingNames: string[];
    /** Số nhóm liên kết khác nhau mà thành viên cụm này ĐÃ VÀO (joined = true). */
    distinctGroups: number;
    groupNames: string[];
    latestCreatedAt: string;
  }>;
}

export interface StatsPeriod {
  /** Mốc thực tế đã áp dụng ('YYYY-MM-DD', giờ VN); mốc để mở được suy ra từ dữ liệu. */
  from: string;
  to: string;
  /** `true` nếu người dùng KHÔNG giới hạn kỳ (xem toàn bộ thời gian). */
  allTime: boolean;
  granularity: StatsGranularity;
  spanDays: number;
}

export interface InvalidDataStatsResult {
  generatedAt: string;
  invalidType: string;
  period: StatsPeriod;
  overview: InvalidDataOverview;
  /** Khách có "Ngày nhập thực tế" (createdAt) SAU hôm nay - dữ liệu bất thường, không lọt vào kỳ nào tới hết hôm nay. */
  futureCreatedCount: number;
  /** `null` khi `invalidType` không phải loại trùng lặp (chỉ trả tổng quan). */
  duplicate: DuplicateStatsDetail | null;
}

interface DupRow {
  id: number;
  key: string;
  salesUserId: number | null;
  createdById: number | null;
  marketingUserId: number | null;
  /** Các nhóm liên kết mà bản ghi ĐÃ VÀO (joined = true); chỉ được nạp khi phân tích có `withGroups`. */
  groupIds: number[];
  createdAt: Date;
  /** 'YYYY-MM-DD' theo giờ VN của createdAt. */
  day: string;
}

interface DupCluster {
  key: string;
  /** Sắp xếp theo thời điểm tạo tăng dần; phần tử đầu = bản gốc. */
  members: DupRow[];
  /** Các bản dư (không phải bản gốc) có ngày nhập nằm trong kỳ. */
  redundantInRange: DupRow[];
}

/** Kỳ dùng nội bộ: mốc `null` = để mở. */
interface Range {
  from: string | null;
  to: string | null;
}

/** Cộng `delta` ngày vào chuỗi 'YYYY-MM-DD' (tính theo UTC, không phụ thuộc timezone máy chủ). */
export function shiftDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** Số ngày giữa 2 chuỗi 'YYYY-MM-DD' (b - a). */
export function diffDays(a: string, b: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/**
 * 00:00 ngày `dateStr` GIỜ VN -> chuỗi UTC 'YYYY-MM-DD HH:mm:ss' để so sánh với cột
 * `created_at` (lưu UTC - cùng quy ước `CONVERT_TZ(created_at,'+00:00','+07:00')` ở
 * `getStatsToday`). Việt Nam không có DST nên offset cố định.
 */
export function vnDayStartUtc(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00${VN_OFFSET}`).toISOString().slice(0, 19).replace('T', ' ');
}

function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Chuẩn hoá kỳ người dùng chọn. Không có mốc nào = toàn bộ thời gian. Đảo mốc nếu
 * `from > to`; co `from` lại nếu kỳ vượt STATS_MAX_RANGE_DAYS.
 */
export function resolveRange(dateFrom?: string, dateTo?: string): Range {
  const from = dateFrom?.trim() || null;
  const to = dateTo?.trim() || null;
  for (const v of [from, to]) {
    if (v && !isValidDateStr(v)) throw new BadRequestException(`Ngày không hợp lệ: "${v}" (cần dạng YYYY-MM-DD)`);
  }
  if (from && to) {
    let [a, b] = from <= to ? [from, to] : [to, from];
    if (diffDays(a, b) + 1 > STATS_MAX_RANGE_DAYS) a = shiftDateStr(b, -(STATS_MAX_RANGE_DAYS - 1));
    return { from: a, to: b };
  }
  return { from, to };
}

/** Mã bucket của 1 ngày. */
const bucketOf = (day: string, g: StatsGranularity) => (g === 'month' ? day.slice(0, 7) : day);

/** Danh sách bucket liên tục từ `from` đến `to` (gồm cả bucket không có dữ liệu). */
export function buildBuckets(from: string, to: string, g: StatsGranularity): string[] {
  const out: string[] = [];
  if (g === 'day') {
    const n = diffDays(from, to);
    for (let i = 0; i <= n; i++) out.push(shiftDateStr(from, i));
    return out;
  }
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * CustomersInvalidStatsService - "Thống kê data lỗi" cho tab Thống kê của trang
 * /customers/reports/invalid-data.
 *
 * KỲ THỐNG KÊ (`dateFrom`/`dateTo`, lọc theo "Ngày nhập thực tế" = createdAt, giờ VN)
 * áp dụng cho MỌI con số/biểu đồ/bảng của tab:
 *  - Tổng khách, Thiếu SĐT/Email, Ngày nhập > hiện tại: khách NHẬP TRONG KỲ.
 *  - Trùng SĐT/Email: bản trùng PHÁT SINH trong kỳ. Trong mỗi cụm trùng, bản tạo SỚM
 *    NHẤT là "bản gốc" (kể cả nhập ngoài kỳ), các bản còn lại là bản "dư"; cụm được
 *    tính khi có >= 1 bản dư nhập trong kỳ. Tỷ lệ trùng = bản dư trong kỳ / khách có
 *    giá trị nhập trong kỳ.
 *
 * HIỆU NĂNG - chỉ truy vấn phần cần cho kỳ đang chọn: (1) lấy khoá SĐT/Email của khách
 * nhập trong kỳ, (2) trong số đó tìm khoá đang trùng, (3) chỉ tải thành viên của các
 * cụm đó. Không quét toàn bộ cụm trùng của cả bảng (trừ khi chọn "Toàn bộ").
 *
 * Quy ước cụm trùng giống `getDuplicateContactReport()`: SĐT dùng nguyên văn, Email
 * dùng LOWER(TRIM()). Phạm vi xem: MỌI truy vấn đi qua `CustomerAccessHelper.applyViewFilter`.
 */
@Injectable()
export class CustomersInvalidStatsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CustomerGroupMembership)
    private readonly membershipRepo: Repository<CustomerGroupMembership>,
  ) {}

  private static groupExpr(isEmail: boolean) {
    return isEmail ? 'LOWER(TRIM(customer.email))' : 'customer.phone';
  }

  private static nonEmptyCondition(isEmail: boolean) {
    return isEmail
      ? "customer.email IS NOT NULL AND TRIM(customer.email) != ''"
      : "customer.phone IS NOT NULL AND customer.phone != ''";
  }

  /** Áp khoảng "Ngày nhập thực tế" (createdAt) theo giờ VN; mốc null = để mở. */
  private static applyCreatedRange(qb: SelectQueryBuilder<Customer>, range: Range) {
    if (range.from) qb.andWhere('customer.createdAt >= :statsCreatedFrom', { statsCreatedFrom: vnDayStartUtc(range.from) });
    if (range.to) {
      qb.andWhere('customer.createdAt < :statsCreatedToEnd', { statsCreatedToEnd: vnDayStartUtc(shiftDateStr(range.to, 1)) });
    }
    return qb;
  }

  private inRange(day: string, range: Range) {
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  }

  private baseQb(userId: number, userRole: string, scope?: string | null) {
    const qb = this.customerRepo.createQueryBuilder('customer').where('customer.deletedAt IS NULL');
    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);
    return qb;
  }

  /**
   * Phân tích trùng lặp trong `range`: các cụm có bản dư nhập trong kỳ + số khách có
   * giá trị nhập trong kỳ (mẫu số).
   */
  private async analyzeDuplicates(
    isEmail: boolean,
    range: Range,
    userId: number,
    userRole: string,
    scope?: string | null,
    /** `true` khi đang xem chi tiết loại này - nạp thêm nhóm liên kết (join thêm bảng, chỉ cần cho loại đang hiển thị). */
    withGroups = false,
  ): Promise<{ clusters: DupCluster[]; totalWithValue: number; groupNames: Map<number, string> }> {
    const groupNames = new Map<number, string>();
    const expr = CustomersInvalidStatsService.groupExpr(isEmail);
    const nonEmpty = CustomersInvalidStatsService.nonEmptyCondition(isEmail);
    const bounded = !!(range.from || range.to);

    const totalQb = this.baseQb(userId, userRole, scope).andWhere(nonEmpty);
    CustomersInvalidStatsService.applyCreatedRange(totalQb, range);
    const totalWithValue = await totalQb.getCount();
    if (totalWithValue === 0) return { clusters: [], totalWithValue, groupNames };

    // (1) Khoá ứng viên = khoá của khách nhập trong kỳ (bỏ qua bước này khi xem toàn bộ).
    let candidateChunks: Array<string[] | null> = [null];
    if (bounded) {
      const candQb = this.baseQb(userId, userRole, scope).select(expr, 'dupKey').distinct(true).andWhere(nonEmpty);
      CustomersInvalidStatsService.applyCreatedRange(candQb, range);
      const candRows = await candQb.getRawMany<{ dupKey: string }>();
      const cand = candRows.map((r) => r.dupKey).filter((k) => !!k);
      if (cand.length === 0) return { clusters: [], totalWithValue, groupNames };
      candidateChunks = [];
      for (let i = 0; i < cand.length; i += KEY_CHUNK_SIZE) candidateChunks.push(cand.slice(i, i + KEY_CHUNK_SIZE));
    }

    // (2) Trong ứng viên, khoá nào thực sự trùng (>= 2 khách, TOÀN BỘ thời gian trong phạm vi xem).
    const dupKeys: string[] = [];
    for (const chunk of candidateChunks) {
      const qb = this.baseQb(userId, userRole, scope)
        .select(expr, 'dupKey')
        .addSelect('COUNT(*)', 'cnt')
        .andWhere(nonEmpty);
      if (chunk) qb.andWhere(`${expr} IN (:...statsCandKeys)`, { statsCandKeys: chunk });
      qb.groupBy(expr).having('COUNT(*) > 1');
      const rows = await qb.getRawMany<{ dupKey: string }>();
      rows.forEach((r) => r.dupKey && dupKeys.push(r.dupKey));
    }
    if (dupKeys.length === 0) return { clusters: [], totalWithValue, groupNames };

    // (3) Chỉ tải thành viên của các cụm trùng đó.
    const byKey = new Map<string, DupRow[]>();
    for (let i = 0; i < dupKeys.length; i += KEY_CHUNK_SIZE) {
      const chunk = dupKeys.slice(i, i + KEY_CHUNK_SIZE);
      const raw = await this.baseQb(userId, userRole, scope)
        .select('customer.id', 'id')
        .addSelect(expr, 'dup_key')
        .addSelect('customer.salesUserId', 'sales_user_id')
        .addSelect('customer.createdById', 'created_by_id')
        .addSelect('customer.marketingUserId', 'marketing_user_id')
        .addSelect('customer.createdAt', 'created_at')
        .andWhere(`${expr} IN (:...statsKeys)`, { statsKeys: chunk })
        .getRawMany<{
          id: number | string;
          dup_key: string;
          sales_user_id: number | string | null;
          created_by_id: number | string | null;
          marketing_user_id: number | string | null;
          created_at: Date | string;
        }>();
      for (const r of raw) {
        const createdAt = new Date(r.created_at);
        const row: DupRow = {
          id: Number(r.id),
          key: r.dup_key,
          salesUserId: r.sales_user_id == null ? null : Number(r.sales_user_id),
          createdById: r.created_by_id == null ? null : Number(r.created_by_id),
          marketingUserId: r.marketing_user_id == null ? null : Number(r.marketing_user_id),
          groupIds: [],
          createdAt,
          day: toVnDateStr(createdAt),
        };
        const arr = byKey.get(row.key) ?? [];
        arr.push(row);
        byKey.set(row.key, arr);
      }
    }

    const clusters: DupCluster[] = [];
    for (const [key, members] of byKey) {
      if (members.length < 2) continue; // an toàn: cụm bị thu hẹp do phạm vi quyền xem
      members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
      const redundantInRange = members.slice(1).filter((m) => this.inRange(m.day, range));
      if (redundantInRange.length > 0) clusters.push({ key, members, redundantInRange });
    }
    if (withGroups && clusters.length > 0) {
      await this.attachGroups(clusters.flatMap((c) => c.members), groupNames);
    }
    return { clusters, totalWithValue, groupNames };
  }

  /**
   * Nạp các nhóm liên kết "ĐÃ VÀO" (joined = true - cùng quy ước với `getCustomers()`/
   * cột "Đã tham gia nhóm") cho các bản ghi thành viên CỦA CỤM TRÙNG đang xét - chỉ
   * truy vấn đúng các khách nằm trong cụm, không quét toàn bộ bảng membership.
   */
  private async attachGroups(rows: DupRow[], groupNames: Map<number, string>): Promise<void> {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += KEY_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + KEY_CHUNK_SIZE);
      const raw = await this.membershipRepo
        .createQueryBuilder('m')
        .innerJoin('m.group', 'g')
        .select('m.customerId', 'customer_id')
        .addSelect('m.groupId', 'group_id')
        .addSelect('g.name', 'group_name')
        .where('m.joined = true')
        .andWhere('m.customerId IN (:...statsMemberIds)', { statsMemberIds: chunk })
        .getRawMany<{ customer_id: number | string; group_id: number | string; group_name: string }>();
      for (const r of raw) {
        const row = byId.get(Number(r.customer_id));
        if (!row) continue;
        const gid = Number(r.group_id);
        if (!row.groupIds.includes(gid)) row.groupIds.push(gid);
        groupNames.set(gid, r.group_name);
      }
    }
  }

  private static summarize(clusters: DupCluster[]): DuplicateOverviewItem {
    return { groups: clusters.length, redundant: clusters.reduce((s, c) => s + c.redundantInRange.length, 0) };
  }

  async getStats(
    userId: number,
    userRole: string,
    scope?: string | null,
    invalidType: string = 'duplicate_phone',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<InvalidDataStatsResult> {
    const range = resolveRange(dateFrom, dateTo);
    const today = todayVnStr();
    const C = CustomersInvalidStatsService;
    const counted = (extra?: string, params?: Record<string, unknown>) => {
      const qb = this.baseQb(userId, userRole, scope);
      if (extra) qb.andWhere(extra, params);
      return C.applyCreatedRange(qb, range).getCount();
    };
    // createdAt > hết hôm nay (giờ VN) - độc lập với kỳ, để cảnh báo dữ liệu bất thường.
    const futureCreatedQb = this.baseQb(userId, userRole, scope).andWhere('customer.createdAt >= :statsFutureFrom', {
      statsFutureFrom: vnDayStartUtc(shiftDateStr(today, 1)),
    });

    const [totalCustomers, futureDate, missingPhone, missingEmail, futureCreatedCount, phoneA, emailA] = await Promise.all([
      counted(),
      counted('customer.inputDate > :statsToday', { statsToday: today }),
      counted("(customer.phone IS NULL OR customer.phone = '')"),
      counted("(customer.email IS NULL OR customer.email = '')"),
      futureCreatedQb.getCount(),
      // Nạp nhóm liên kết (join thêm bảng) CHỈ cho loại đang xem chi tiết - loại còn lại
      // chỉ cần số tổng quan (thẻ Trùng SĐT/Trùng Email) nên không cần thông tin nhóm.
      this.analyzeDuplicates(false, range, userId, userRole, scope, invalidType === 'duplicate_phone'),
      this.analyzeDuplicates(true, range, userId, userRole, scope, invalidType === 'duplicate_email'),
    ]);

    const overview: InvalidDataOverview = {
      totalCustomers,
      future_date: futureDate,
      missing_phone: missingPhone,
      missing_email: missingEmail,
      duplicate_phone: C.summarize(phoneA.clusters),
      duplicate_email: C.summarize(emailA.clusters),
    };

    const isDuplicate = invalidType === 'duplicate_phone' || invalidType === 'duplicate_email';
    let duplicate: DuplicateStatsDetail | null = null;
    let period = this.buildPeriod(range, today, []);
    if (isDuplicate) {
      const isEmail = invalidType === 'duplicate_email';
      const analysis = isEmail ? emailA : phoneA;
      period = this.buildPeriod(range, today, analysis.clusters.flatMap((c) => c.redundantInRange.map((m) => m.day)));

      let previousRedundantCount: number | null = null;
      if (range.from && range.to) {
        const span = diffDays(range.from, range.to) + 1;
        const prevTo = shiftDateStr(range.from, -1);
        const prev = await this.analyzeDuplicates(isEmail, { from: shiftDateStr(prevTo, -(span - 1)), to: prevTo }, userId, userRole, scope);
        previousRedundantCount = C.summarize(prev.clusters).redundant;
      }
      duplicate = await this.buildDuplicateDetail(analysis, period, previousRedundantCount);
    }

    return { generatedAt: today, invalidType, period, overview, futureCreatedCount, duplicate };
  }

  /** Mốc để mở được suy ra từ dữ liệu (`redundantDays`) - tối thiểu 1 ngày, tối đa tới hôm nay. */
  private buildPeriod(range: Range, today: string, redundantDays: string[]): StatsPeriod {
    const sorted = [...redundantDays].sort();
    let from = range.from ?? sorted[0] ?? today;
    let to = range.to ?? today;
    if (!range.to && sorted.length && sorted[sorted.length - 1] > to) to = sorted[sorted.length - 1];
    if (!range.from && to < from) from = to;
    if (from > to) from = to;
    const spanDays = diffDays(from, to) + 1;
    return {
      from,
      to,
      allTime: !range.from && !range.to,
      granularity: spanDays > STATS_DAY_BUCKET_MAX_SPAN ? 'month' : 'day',
      spanDays,
    };
  }

  private async buildDuplicateDetail(
    analysis: { clusters: DupCluster[]; totalWithValue: number; groupNames: Map<number, string> },
    period: StatsPeriod,
    previousRedundantCount: number | null,
  ): Promise<DuplicateStatsDetail> {
    const { clusters, totalWithValue, groupNames } = analysis;

    const trendMap = new Map<string, number>();
    for (const b of buildBuckets(period.from, period.to, period.granularity)) trendMap.set(b, 0);

    let affectedCustomers = 0;
    let crossSalesGroups = 0;
    let maxGroupSize = 0;
    let redundantCount = 0;
    const sizeBuckets = new Map<string, number>([
      ['2 bản ghi', 0],
      ['3 bản ghi', 0],
      ['4 bản ghi', 0],
      ['5+ bản ghi', 0],
    ]);
    const creatorCounts = new Map<number, number>();
    const groupSummaries: Array<{
      key: string;
      size: number;
      newInPeriod: number;
      salesIds: number[];
      marketingIds: number[];
      linkGroupIds: number[];
      latest: Date;
    }> = [];

    // Marketing/nhóm liên kết.
    let crossMarketingClusters = 0;
    let sameMarketingClusters = 0;
    let noMarketingClusters = 0;
    let crossGroupClusters = 0;
    let singleGroupClusters = 0;
    let noGroupClusters = 0;
    let unassignedMarketingRedundant = 0;
    const marketerRedundant = new Map<number, number>();
    const marketerClusterKeys = new Map<number, Set<string>>();
    const groupClusterCount = new Map<number, number>();
    const groupRedundantCount = new Map<number, number>();
    const pairClusterCount = new Map<string, number>();

    for (const c of clusters) {
      const size = c.members.length;
      affectedCustomers += size;
      maxGroupSize = Math.max(maxGroupSize, size);
      const bucket = size >= 5 ? '5+ bản ghi' : `${size} bản ghi`;
      sizeBuckets.set(bucket, (sizeBuckets.get(bucket) ?? 0) + 1);

      const salesIds = [...new Set(c.members.map((m) => m.salesUserId).filter((s): s is number => s != null))];
      if (salesIds.length >= 2) crossSalesGroups += 1;

      const marketingIds = [...new Set(c.members.map((m) => m.marketingUserId).filter((s): s is number => s != null))];
      if (marketingIds.length >= 2) crossMarketingClusters += 1;
      else if (marketingIds.length === 1) sameMarketingClusters += 1;
      else noMarketingClusters += 1;

      // Nhóm liên kết mà CỤM NÀY có mặt = hợp các nhóm (đã vào) của mọi thành viên.
      const linkGroupIds = [...new Set(c.members.flatMap((m) => m.groupIds))].sort((a, b) => a - b);
      if (linkGroupIds.length >= 2) crossGroupClusters += 1;
      else if (linkGroupIds.length === 1) singleGroupClusters += 1;
      else noGroupClusters += 1;
      for (const gid of linkGroupIds) groupClusterCount.set(gid, (groupClusterCount.get(gid) ?? 0) + 1);
      for (let i = 0; i < linkGroupIds.length; i++) {
        for (let j = i + 1; j < linkGroupIds.length; j++) {
          const pairKey = `${linkGroupIds[i]}-${linkGroupIds[j]}`;
          pairClusterCount.set(pairKey, (pairClusterCount.get(pairKey) ?? 0) + 1);
        }
      }

      for (const m of c.redundantInRange) {
        redundantCount += 1;
        if (m.createdById != null) creatorCounts.set(m.createdById, (creatorCounts.get(m.createdById) ?? 0) + 1);
        if (m.marketingUserId == null) {
          unassignedMarketingRedundant += 1;
        } else {
          marketerRedundant.set(m.marketingUserId, (marketerRedundant.get(m.marketingUserId) ?? 0) + 1);
          const set = marketerClusterKeys.get(m.marketingUserId) ?? new Set<string>();
          set.add(c.key);
          marketerClusterKeys.set(m.marketingUserId, set);
        }
        for (const gid of m.groupIds) groupRedundantCount.set(gid, (groupRedundantCount.get(gid) ?? 0) + 1);
        const b = bucketOf(m.day, period.granularity);
        if (trendMap.has(b)) trendMap.set(b, (trendMap.get(b) ?? 0) + 1);
      }
      groupSummaries.push({
        key: c.key,
        size,
        newInPeriod: c.redundantInRange.length,
        salesIds,
        marketingIds,
        linkGroupIds,
        latest: c.members[c.members.length - 1].createdAt,
      });
    }

    const groupCount = clusters.length;
    const topCreatorEntries = [...creatorCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, STATS_TOP_N);
    const topGroupsRaw = [...groupSummaries]
      .sort((a, b) => b.size - a.size || b.latest.getTime() - a.latest.getTime() || a.key.localeCompare(b.key))
      .slice(0, STATS_TOP_N);
    const topMarketerEntries = [...marketerRedundant.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, STATS_TOP_N);
    const groupStatEntries = [...groupClusterCount.entries()]
      .sort((a, b) => b[1] - a[1] || (groupRedundantCount.get(b[0]) ?? 0) - (groupRedundantCount.get(a[0]) ?? 0) || a[0] - b[0])
      .slice(0, STATS_TOP_GROUPS);
    const pairEntries = [...pairClusterCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, STATS_TOP_N);

    // Tên người dùng cho Top người tạo/Top Marketing + tên Sales/Marketing của Top cụm (1 query duy nhất).
    const userIds = new Set<number>(topCreatorEntries.map(([id]) => id));
    topMarketerEntries.forEach(([id]) => userIds.add(id));
    topGroupsRaw.forEach((g) => {
      g.salesIds.forEach((id) => userIds.add(id));
      g.marketingIds.forEach((id) => userIds.add(id));
    });
    const nameById = new Map<number, string>();
    if (userIds.size > 0) {
      const users = await this.userRepo.find({ where: { id: In([...userIds]) }, select: { id: true, name: true } });
      users.forEach((u) => nameById.set(u.id, u.name));
    }

    return {
      totalWithValue,
      redundantCount,
      groupCount,
      affectedCustomers,
      duplicateRatePercent: totalWithValue > 0 ? Math.round((redundantCount / totalWithValue) * 1000) / 10 : null,
      previousRedundantCount,
      maxGroupSize,
      crossSalesGroups,
      sameSalesGroups: groupCount - crossSalesGroups,
      crossMarketingClusters,
      sameMarketingClusters,
      noMarketingClusters,
      crossGroupClusters,
      singleGroupClusters,
      noGroupClusters,
      unassignedMarketingRedundant,
      topMarketers: topMarketerEntries.map(([id, count]) => ({
        userId: id,
        name: nameById.get(id) ?? `#${id}`,
        redundantCount: count,
        clusterCount: marketerClusterKeys.get(id)?.size ?? 0,
      })),
      groupStats: groupStatEntries.map(([gid, clusterCount]) => ({
        groupId: gid,
        name: groupNames.get(gid) ?? `#${gid}`,
        clusterCount,
        redundantCount: groupRedundantCount.get(gid) ?? 0,
      })),
      groupPairs: pairEntries.map(([pairKey, clusterCount]) => {
        const [a, b] = pairKey.split('-').map(Number);
        return {
          groupAId: a,
          groupAName: groupNames.get(a) ?? `#${a}`,
          groupBId: b,
          groupBName: groupNames.get(b) ?? `#${b}`,
          clusterCount,
        };
      }),
      sizeDistribution: [...sizeBuckets.entries()].map(([label, groups]) => ({ label, groups })),
      trend: [...trendMap.entries()].map(([date, redundant]) => ({ date, redundant })),
      topCreators: topCreatorEntries.map(([id, count]) => ({ userId: id, name: nameById.get(id) ?? `#${id}`, redundantCount: count })),
      topGroups: topGroupsRaw.map((g) => ({
        key: g.key,
        size: g.size,
        newInPeriod: g.newInPeriod,
        distinctSales: g.salesIds.length,
        salesNames: g.salesIds.slice(0, 3).map((id) => nameById.get(id) ?? `#${id}`),
        distinctMarketing: g.marketingIds.length,
        marketingNames: g.marketingIds.slice(0, 3).map((id) => nameById.get(id) ?? `#${id}`),
        distinctGroups: g.linkGroupIds.length,
        groupNames: g.linkGroupIds.slice(0, 3).map((gid) => groupNames.get(gid) ?? `#${gid}`),
        latestCreatedAt: g.latest.toISOString(),
      })),
    };
  }
}
