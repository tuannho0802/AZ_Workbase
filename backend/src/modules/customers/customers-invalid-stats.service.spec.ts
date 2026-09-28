import { BadRequestException } from '@nestjs/common';
import {
  CustomersInvalidStatsService,
  STATS_DAY_BUCKET_MAX_SPAN,
  STATS_MAX_RANGE_DAYS,
  buildBuckets,
  diffDays,
  resolveRange,
  shiftDateStr,
  vnDayStartUtc,
} from './customers-invalid-stats.service';

interface Fx {
  id: number;
  phone: string | null;
  email: string | null;
  salesUserId: number | null;
  createdById: number | null;
  marketingUserId?: number | null;
  createdAt: Date;
  inputDate?: string;
}

/** 1 dòng "membership giả" - tương đương 1 bản ghi `customer_group_memberships`. */
interface Ms {
  customerId: number;
  groupId: number;
  groupName: string;
  joined: boolean;
}

const utcStr = (s: unknown) => new Date(`${String(s).replace(' ', 'T')}Z`);

/**
 * "DB giả" đánh giá THẬT các điều kiện service dùng (kỳ createdAt, IN, GROUP BY/HAVING,
 * NULL/rỗng...) trên danh sách khách cố định. `applyViewFilter` với role 'admin' không thêm điều kiện.
 */
function makeService(customers: Fx[], users: Array<{ id: number; name: string }> = [], memberships: Ms[] = []) {
  const createQueryBuilder = jest.fn().mockImplementation(() => {
    const st = { selects: [] as string[], wheres: [] as string[], params: {} as Record<string, unknown>, distinct: false, having: false };
    const qb: Record<string, unknown> = {};
    const chain = (fn: (...a: unknown[]) => void) => jest.fn().mockImplementation((...a: unknown[]) => (fn(...a), qb));
    qb.select = chain((e) => st.selects.push(String(e)));
    qb.addSelect = chain((e) => st.selects.push(String(e)));
    qb.where = chain((c, p) => (st.wheres.push(String(c)), Object.assign(st.params, p ?? {})));
    qb.andWhere = qb.where;
    qb.distinct = chain(() => (st.distinct = true));
    qb.groupBy = chain(() => undefined);
    qb.having = chain(() => (st.having = true));

    const text = () => [...st.selects, ...st.wheres].join(' | ');
    const isEmail = () => /customer\.email/.test(text()) && !/customer\.phone IS NOT NULL/.test(text());
    const keyOf = (c: Fx) => (isEmail() ? (c.email ?? '').trim().toLowerCase() : (c.phone ?? ''));
    const filtered = () => {
      const t = st.wheres.join(' | ');
      return customers.filter((c) => {
        if (/customer\.phone IS NOT NULL/.test(t) && !c.phone) return false;
        if (/customer\.email IS NOT NULL/.test(t) && !(c.email ?? '').trim()) return false;
        if (/customer\.phone IS NULL OR/.test(t) && !!c.phone) return false;
        if (/customer\.email IS NULL OR/.test(t) && !!c.email) return false;
        if (/customer\.inputDate >/.test(t) && !((c.inputDate ?? '') > String(st.params.statsToday))) return false;
        if (st.params.statsCreatedFrom && c.createdAt < utcStr(st.params.statsCreatedFrom)) return false;
        if (st.params.statsCreatedToEnd && c.createdAt >= utcStr(st.params.statsCreatedToEnd)) return false;
        if (st.params.statsFutureFrom && c.createdAt < utcStr(st.params.statsFutureFrom)) return false;
        const inKeys = (st.params.statsCandKeys ?? st.params.statsKeys) as string[] | undefined;
        if (inKeys && !inKeys.includes(keyOf(c))) return false;
        return true;
      });
    };
    qb.getCount = jest.fn().mockImplementation(async () => filtered().length);
    qb.getRawMany = jest.fn().mockImplementation(async () => {
      const rows = filtered();
      if (st.selects.some((s) => s.includes('customer.createdById'))) {
        return rows.map((c) => ({
          id: c.id,
          dup_key: keyOf(c),
          sales_user_id: c.salesUserId,
          created_by_id: c.createdById,
          marketing_user_id: c.marketingUserId ?? null,
          created_at: c.createdAt,
        }));
      }
      if (st.distinct) return [...new Set(rows.map(keyOf))].map((dupKey) => ({ dupKey }));
      const counts = new Map<string, number>();
      rows.forEach((c) => counts.set(keyOf(c), (counts.get(keyOf(c)) ?? 0) + 1));
      return [...counts.entries()].filter(([, n]) => n > 1).map(([dupKey, cnt]) => ({ dupKey, cnt }));
    });
    return qb;
  });
  const userRepo = { find: jest.fn().mockResolvedValue(users) };

  // Repo membership giả: chỉ trả các dòng joined = true thuộc đúng danh sách khách được
  // truyền vào (giống hệt truy vấn SQL thật - chỉ tải thành viên của cụm đang xét).
  const membershipQb = jest.fn().mockImplementation(() => {
    const params: Record<string, unknown> = {};
    const qb: Record<string, unknown> = {};
    const chain = () => jest.fn().mockImplementation(() => qb);
    qb.innerJoin = chain();
    qb.select = chain();
    qb.addSelect = chain();
    qb.where = jest.fn().mockImplementation((_c: string) => qb);
    qb.andWhere = jest.fn().mockImplementation((_c: string, p: Record<string, unknown>) => (Object.assign(params, p), qb));
    qb.getRawMany = jest.fn().mockImplementation(async () => {
      const ids = (params.statsMemberIds ?? []) as number[];
      return memberships
        .filter((m) => m.joined && ids.includes(m.customerId))
        .map((m) => ({ customer_id: m.customerId, group_id: m.groupId, group_name: m.groupName }));
    });
    return qb;
  });
  const membershipRepo = { createQueryBuilder: membershipQb };

  const service = new CustomersInvalidStatsService({ createQueryBuilder } as never, userRepo as never, membershipRepo as never);
  return { service, userRepo, createQueryBuilder, membershipQb };
}

const at = (iso: string) => new Date(iso);
const base = { salesUserId: null, createdById: null, email: null as string | null };

// Hôm nay (giờ VN) = 2026-09-28. Kỳ "7 ngày" = 2026-09-22 .. 2026-09-28.
const DATA: Fx[] = [
  { ...base, id: 1, phone: '0901111111', salesUserId: 10, createdById: 5, marketingUserId: 20, createdAt: at('2026-08-01T03:00:00Z') },
  { ...base, id: 2, phone: '0901111111', salesUserId: 11, createdById: 6, marketingUserId: 21, createdAt: at('2026-09-27T10:00:00Z') },
  { ...base, id: 3, phone: '0901111111', salesUserId: 11, createdById: 6, marketingUserId: 21, createdAt: at('2026-09-28T02:00:00Z') },
  { ...base, id: 4, phone: '0902222222', salesUserId: 10, createdById: 5, marketingUserId: 20, createdAt: at('2026-01-05T03:00:00Z') },
  { ...base, id: 5, phone: '0902222222', salesUserId: 10, createdById: 5, marketingUserId: 20, createdAt: at('2026-09-23T10:00:00Z') },
  { ...base, id: 6, phone: '0903333333', salesUserId: 10, createdById: 5, createdAt: at('2026-03-01T03:00:00Z') },
  { ...base, id: 7, phone: '0903333333', salesUserId: 10, createdById: 5, createdAt: at('2026-03-02T03:00:00Z') },
  { ...base, id: 13, phone: '0904444444', salesUserId: 10, createdById: 5, createdAt: at('2026-09-01T03:00:00Z') },
  { ...base, id: 14, phone: '0904444444', salesUserId: 10, createdById: 5, createdAt: at('2026-09-18T03:00:00Z') },
  { ...base, id: 8, phone: '0908888881', email: 'A@x.com', createdAt: at('2026-09-10T03:00:00Z') },
  { ...base, id: 9, phone: '0908888882', email: ' a@x.com ', createdAt: at('2026-09-25T03:00:00Z') },
  { ...base, id: 10, phone: null, createdAt: at('2026-09-26T03:00:00Z') },
  { ...base, id: 11, phone: '0909999999', inputDate: '2026-10-05', createdAt: at('2026-09-27T03:00:00Z') },
  { ...base, id: 12, phone: '0907777777', createdAt: at('2026-10-06T00:00:00Z') },
];
const USERS = [
  { id: 5, name: 'Nhân viên 5' },
  { id: 6, name: 'Nhân viên 6' },
  { id: 10, name: 'Sales 10' },
  { id: 11, name: 'Sales 11' },
  { id: 20, name: 'Marketing 20' },
  { id: 21, name: 'Marketing 21' },
];

/**
 * Membership giả cho cụm SĐT (0901111111: id 1,2,3 / 0902222222: id 4,5).
 * id2 còn 1 dòng joined=false (Nhóm Ba) để kiểm tra bị loại đúng quy ước "Đã tham gia nhóm".
 */
const MEMBERSHIPS: Ms[] = [
  { customerId: 1, groupId: 1, groupName: 'Nhóm Một', joined: true },
  { customerId: 2, groupId: 2, groupName: 'Nhóm Hai', joined: true },
  { customerId: 2, groupId: 3, groupName: 'Nhóm Ba', joined: false },
  { customerId: 3, groupId: 2, groupName: 'Nhóm Hai', joined: true },
  { customerId: 4, groupId: 1, groupName: 'Nhóm Một', joined: true },
  { customerId: 5, groupId: 1, groupName: 'Nhóm Một', joined: true },
];

describe('date helpers', () => {
  it('shiftDateStr / diffDays qua ranh giới tháng, năm', () => {
    expect(shiftDateStr('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateStr('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-09-22', '2026-09-28')).toBe(6);
  });
  it('vnDayStartUtc: 00:00 giờ VN = 17:00 UTC ngày hôm trước', () => {
    expect(vnDayStartUtc('2026-09-28')).toBe('2026-09-27 17:00:00');
  });
  it('buildBuckets theo ngày và theo tháng (liên tục, gồm bucket rỗng)', () => {
    expect(buildBuckets('2026-09-26', '2026-09-28', 'day')).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
    expect(buildBuckets('2025-11-15', '2026-02-01', 'month')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('resolveRange', () => {
  it('không truyền mốc = toàn bộ thời gian; 1 mốc = để mở phía còn lại', () => {
    expect(resolveRange()).toEqual({ from: null, to: null });
    expect(resolveRange('2026-09-01', undefined)).toEqual({ from: '2026-09-01', to: null });
  });
  it('đảo mốc khi from > to', () => {
    expect(resolveRange('2026-09-28', '2026-09-22')).toEqual({ from: '2026-09-22', to: '2026-09-28' });
  });
  it(`co kỳ về tối đa ${STATS_MAX_RANGE_DAYS} ngày (giữ mốc cuối)`, () => {
    const r = resolveRange('2020-01-01', '2026-09-28');
    expect(r.to).toBe('2026-09-28');
    expect(diffDays(r.from!, r.to!) + 1).toBe(STATS_MAX_RANGE_DAYS);
  });
  it('ném BadRequest với ngày sai định dạng hoặc không có thật', () => {
    expect(() => resolveRange('28/09/2026', undefined)).toThrow(BadRequestException);
    expect(() => resolveRange('2026-02-30', undefined)).toThrow(BadRequestException);
  });
});

describe('CustomersInvalidStatsService.getStats', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-28T05:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  });
  afterEach(() => jest.useRealTimers());

  it('kỳ 7 ngày: MỌI thẻ/KPI/biểu đồ chỉ tính trong kỳ', async () => {
    const { service } = makeService(DATA, USERS);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28');

    expect(res.period).toMatchObject({ from: '2026-09-22', to: '2026-09-28', allTime: false, granularity: 'day', spanDays: 7 });
    expect(res.overview.totalCustomers).toBe(6);
    expect(res.overview.future_date).toBe(1);
    expect(res.overview.missing_phone).toBe(1);
    expect(res.overview.missing_email).toBe(5);
    expect(res.overview.duplicate_phone).toEqual({ redundant: 3, groups: 2 });
    expect(res.overview.duplicate_email).toEqual({ redundant: 1, groups: 1 });
    expect(res.futureCreatedCount).toBe(1);

    const d = res.duplicate!;
    expect(d.totalWithValue).toBe(5);
    expect(d.redundantCount).toBe(3);
    expect(d.groupCount).toBe(2);
    expect(d.affectedCustomers).toBe(5);
    expect(d.duplicateRatePercent).toBe(60);
    expect(d.previousRedundantCount).toBe(1);
    expect(d.maxGroupSize).toBe(3);
    expect(d.crossSalesGroups).toBe(1);
    expect(d.sameSalesGroups).toBe(1);
    expect(d.sizeDistribution).toEqual([
      { label: '2 bản ghi', groups: 1 },
      { label: '3 bản ghi', groups: 1 },
      { label: '4 bản ghi', groups: 0 },
      { label: '5+ bản ghi', groups: 0 },
    ]);

    // Trend đủ 7 ngày tới HÔM NAY (không còn thiếu ngày cuối / chart no-data)
    expect(d.trend.map((t) => t.date)).toEqual([
      '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28',
    ]);
    expect(Object.fromEntries(d.trend.filter((t) => t.redundant).map((t) => [t.date, t.redundant]))).toEqual({
      '2026-09-23': 1,
      '2026-09-27': 1,
      '2026-09-28': 1,
    });

    expect(d.topCreators).toEqual([
      { userId: 6, name: 'Nhân viên 6', redundantCount: 2 },
      { userId: 5, name: 'Nhân viên 5', redundantCount: 1 },
    ]);
    expect(d.topGroups.map((g) => [g.key, g.size, g.newInPeriod, g.distinctSales])).toEqual([
      ['0901111111', 3, 2, 2],
      ['0902222222', 2, 1, 1],
    ]);
  });

  it('đổi kỳ sang tuần liền trước: chỉ còn cụm E, kỳ trước đó = 0', async () => {
    const { service } = makeService(DATA, USERS);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-15', '2026-09-21');
    expect(res.overview.duplicate_phone).toEqual({ redundant: 1, groups: 1 });
    expect(res.duplicate!.redundantCount).toBe(1);
    expect(res.duplicate!.previousRedundantCount).toBe(0);
    expect(res.duplicate!.topGroups[0].key).toBe('0904444444');
  });

  it('không chọn kỳ (toàn bộ): gộp theo tháng, mốc suy ra từ dữ liệu, không tính kỳ trước', async () => {
    const { service } = makeService(DATA, USERS);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone');
    expect(res.period.allTime).toBe(true);
    expect(res.period.from).toBe('2026-03-02');
    expect(res.period.to).toBe('2026-09-28');
    expect(res.period.granularity).toBe('month');
    expect(res.period.spanDays).toBeGreaterThan(STATS_DAY_BUCKET_MAX_SPAN);
    const d = res.duplicate!;
    expect(d.redundantCount).toBe(5);
    expect(d.groupCount).toBe(4);
    expect(d.previousRedundantCount).toBeNull();
    expect(d.trend.map((t) => t.date)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(d.trend.reduce((s, t) => s + t.redundant, 0)).toBe(5);
    expect(res.overview.totalCustomers).toBe(DATA.length);
  });

  it('chỉ tải thành viên của cụm liên quan đến kỳ (không quét mọi cụm)', async () => {
    const { service, createQueryBuilder } = makeService(DATA, USERS);
    await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28');
    const qbs = createQueryBuilder.mock.results.map((r) => r.value as Record<string, jest.Mock>);
    const memberQbs = qbs.filter((q) => q.addSelect.mock.calls.some((c) => c[0] === 'customer.createdById'));
    expect(memberQbs.length).toBeGreaterThan(0);
    for (const q of memberQbs) {
      const keys = q.andWhere.mock.calls.map((c) => c[1]?.statsKeys).find(Boolean) as string[];
      expect(keys).toBeDefined();
      // Cụm C (ngoài cả kỳ hiện tại lẫn kỳ liền trước) không bao giờ bị tải.
      expect(keys).not.toContain('0903333333');
    }
  });

  it('loại lỗi không phải trùng lặp: duplicate = null, vẫn trả period', async () => {
    const { service, userRepo } = makeService(DATA, USERS);
    const res = await service.getStats(1, 'admin', null, 'missing_phone', '2026-09-22', '2026-09-28');
    expect(res.duplicate).toBeNull();
    expect(res.period).toMatchObject({ from: '2026-09-22', to: '2026-09-28' });
    expect(userRepo.find).not.toHaveBeenCalled();
  });

  it('kỳ không có dữ liệu: khung trend đủ ngày, tỷ lệ = null (không chia cho 0)', async () => {
    const { service } = makeService(DATA, USERS);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone', '2025-01-01', '2025-01-10');
    const d = res.duplicate!;
    expect(d.totalWithValue).toBe(0);
    expect(d.duplicateRatePercent).toBeNull();
    expect(d.trend).toHaveLength(10);
    expect(d.topGroups).toEqual([]);
  });

  it('bản trùng nhập ở tương lai: không lọt kỳ 7 ngày nhưng được báo qua futureCreatedCount', async () => {
    const withFuture: Fx[] = [
      ...DATA,
      { ...base, id: 20, phone: '0905555555', createdAt: at('2026-09-01T03:00:00Z') },
      { ...base, id: 21, phone: '0905555555', createdAt: at('2026-10-06T00:00:00Z') },
    ];
    const { service } = makeService(withFuture, USERS);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28');
    expect(res.overview.duplicate_phone.redundant).toBe(3);
    expect(res.futureCreatedCount).toBe(2);
  });
});

describe('CustomersInvalidStatsService.getStats - Marketing & Nhóm liên kết', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-28T05:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  });
  afterEach(() => jest.useRealTimers());

  it('phân loại cụm theo Marketing và theo nhóm liên kết (chỉ tính joined = true)', async () => {
    const { service } = makeService(DATA, USERS, MEMBERSHIPS);
    const d = (await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28')).duplicate!;

    // Cụm 0901111111: Marketing 20 (id1) + 21 (id2,3) -> khác nhau. Cụm 0902222222: chỉ Marketing 20.
    expect(d.crossMarketingClusters).toBe(1);
    expect(d.sameMarketingClusters).toBe(1);
    expect(d.noMarketingClusters).toBe(0);
    // Cụm 0901111111: nhóm 1 (id1) + nhóm 2 (id2,3; nhóm 3 chưa vào nên bỏ) -> 2 nhóm khác nhau.
    // Cụm 0902222222: chỉ nhóm 1 (id4, id5).
    expect(d.crossGroupClusters).toBe(1);
    expect(d.singleGroupClusters).toBe(1);
    expect(d.noGroupClusters).toBe(0);
  });

  it('Top Marketing tạo nhiều bản dư nhất + thống kê theo từng nhóm + cặp nhóm hay trùng chung khách', async () => {
    const { service } = makeService(DATA, USERS, MEMBERSHIPS);
    const d = (await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28')).duplicate!;

    // Bản dư trong kỳ: id2,id3 (Marketing 21, cụm 0901111111) + id5 (Marketing 20, cụm 0902222222).
    expect(d.unassignedMarketingRedundant).toBe(0);
    expect(d.topMarketers).toEqual([
      { userId: 21, name: 'Marketing 21', redundantCount: 2, clusterCount: 1 },
      { userId: 20, name: 'Marketing 20', redundantCount: 1, clusterCount: 1 },
    ]);
    // Nhóm 1: có mặt ở CẢ 2 cụm (clusterCount 2), bản dư chỉ id5 (redundantCount 1).
    // Nhóm 2: chỉ ở cụm 0901111111 (clusterCount 1), bản dư id2+id3 (redundantCount 2).
    expect(d.groupStats).toEqual([
      { groupId: 1, name: 'Nhóm Một', clusterCount: 2, redundantCount: 1 },
      { groupId: 2, name: 'Nhóm Hai', clusterCount: 1, redundantCount: 2 },
    ]);
    expect(d.groupPairs).toEqual([
      { groupAId: 1, groupAName: 'Nhóm Một', groupBId: 2, groupBName: 'Nhóm Hai', clusterCount: 1 },
    ]);
    expect(d.topGroups[0]).toMatchObject({
      key: '0901111111',
      distinctMarketing: 2,
      marketingNames: ['Marketing 20', 'Marketing 21'],
      distinctGroups: 2,
      groupNames: ['Nhóm Một', 'Nhóm Hai'],
    });
  });

  it('bản dư CHƯA gán Marketing được đếm riêng (unassignedMarketingRedundant), không quy nhầm cho ai', async () => {
    const noMkt = DATA.map((c) => (c.id === 3 ? { ...c, marketingUserId: null } : c));
    const { service } = makeService(noMkt, USERS, MEMBERSHIPS);
    const d = (await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28')).duplicate!;
    expect(d.unassignedMarketingRedundant).toBe(1);
    expect(d.topMarketers.find((m) => m.userId === 21)?.redundantCount).toBe(1);
  });

  it('chỉ nạp nhóm liên kết cho loại ĐANG xem chi tiết - loại lỗi khác và kỳ liền trước không truy vấn membership', async () => {
    const { service, membershipQb } = makeService(DATA, USERS, MEMBERSHIPS);
    await service.getStats(1, 'admin', null, 'missing_phone', '2026-09-22', '2026-09-28');
    expect(membershipQb).not.toHaveBeenCalled();

    const again = makeService(DATA, USERS, MEMBERSHIPS);
    await again.service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28');
    // 1 lần cho phone của kỳ HIỆN TẠI (kỳ liền trước không cần nhóm; email song song cũng không được chọn).
    expect(again.membershipQb).toHaveBeenCalledTimes(1);
  });

  it('không có membership nào: mọi cụm rơi vào noGroupClusters, groupStats/groupPairs rỗng', async () => {
    const { service } = makeService(DATA, USERS, []);
    const d = (await service.getStats(1, 'admin', null, 'duplicate_phone', '2026-09-22', '2026-09-28')).duplicate!;
    expect(d.noGroupClusters).toBe(2);
    expect(d.groupStats).toEqual([]);
    expect(d.groupPairs).toEqual([]);
  });
});
