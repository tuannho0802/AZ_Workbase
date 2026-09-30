import { ReportsUtmQualityService, sumUtmMetrics } from './reports-utm-quality.service';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { resolvePreviousReportRange, resolveReportRange } from './report-range.util';

/**
 * Mock QueryBuilder theo "hình dạng" query (service chạy nhiều query SONG SONG nên không dùng hàng đợi FIFO):
 * mỗi QB ghi lại alias/biểu thức select, group by, join, tham số; `resolver` quyết định trả gì.
 */
interface QbState {
  aliases: string[];
  exprByAlias: Record<string, string>;
  groupBys: string[];
  leftJoins: any[][];
  params: Record<string, any>;
  wheres: string[];
}

const query = { period: 'month' as const, anchor: '2026-09-15' };
const range = resolveReportRange(query);
const prevRange = resolvePreviousReportRange(query);

describe('ReportsUtmQualityService', () => {
  let states: QbState[];
  let resolver: (s: QbState) => any[];

  function createQb(): any {
    const s: QbState = { aliases: [], exprByAlias: {}, groupBys: [], leftJoins: [], params: {}, wheres: [] };
    states.push(s);
    const qb: any = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === 'select' || prop === 'addSelect')
            return (expr: string, alias: string) => {
              s.aliases.push(alias);
              s.exprByAlias[alias] = expr;
              return qb;
            };
          if (prop === 'groupBy' || prop === 'addGroupBy')
            return (e: string) => {
              s.groupBys.push(e);
              return qb;
            };
          if (prop === 'leftJoin' || prop === 'innerJoin')
            return (...args: any[]) => {
              s.leftJoins.push([prop, ...args]);
              return qb;
            };
          if (prop === 'andWhere' || prop === 'where')
            return (cond: any, params?: any) => {
              s.wheres.push(typeof cond === 'string' ? cond : '[Brackets]');
              if (params) Object.assign(s.params, params);
              return qb;
            };
          if (prop === 'setParameters')
            return (p: any) => {
              Object.assign(s.params, p);
              return qb;
            };
          if (prop === 'getRawMany') return () => Promise.resolve(resolver(s));
          if (prop === 'getRawOne') return () => Promise.resolve(resolver(s)[0] ?? null);
          return () => qb;
        },
      },
    );
    return qb;
  }

  const customerRepo = { createQueryBuilder: jest.fn(() => createQb()) };
  const statusRepo = {
    find: jest.fn(async () => [
      { code: 'pending', name: 'Chờ xử lý', color: 'gold' },
      { code: 'closed', name: 'Đã chốt', color: 'green' },
    ]),
  };
  const utmList = () => [
    { id: 1, name: 'FB_Q3', color: '#1677ff', description: null, visibility: 'shared', isActive: true, lockedAt: null, primaryManagerId: 5, secondaryManagers: [{ userId: 6 }] },
    { id: 2, name: 'TT_OLD', color: '#eb2f96', description: 'cũ', visibility: 'shared', isActive: false, lockedAt: new Date('2026-08-01'), primaryManagerId: null, secondaryManagers: [] },
    { id: 3, name: 'VIP_SECRET', color: '#722ed1', description: null, visibility: 'restricted', isActive: true, lockedAt: null, primaryManagerId: 5, secondaryManagers: [] },
    { id: 4, name: 'EMPTY_ONE', color: '#13c2c2', description: null, visibility: 'shared', isActive: true, lockedAt: null, primaryManagerId: null, secondaryManagers: [] },
  ];
  const utmRepo = { find: jest.fn(async () => utmList()) };
  const userRepo = {
    find: jest.fn(async () => [
      { id: 5, name: 'Quản Lý UTM', role: 'manager', department: { name: 'Marketing', color: '#fa8c16' }, position: { name: 'Trưởng nhóm', color: '#722ed1' } },
      { id: 6, name: 'Phụ UTM', role: 'employee', department: null, position: null },
      { id: 9, name: 'Sales Nine', role: 'employee', department: { name: 'Kinh doanh', color: '#1677ff' }, position: null },
      { id: 11, name: 'Mkt Eleven', role: 'employee', department: { name: 'Marketing', color: '#fa8c16' }, position: null },
    ]),
  };

  const metricRow = (o: Record<string, string>) => ({
    customers: '0', newCustomers: '0', depositedCustomers: '0', closedCustomers: '0', newDeposited: '0', newClosed: '0',
    periodDepositors: '0', periodRevenue: '0', lifetimeRevenue: '0', depositCount: '0', redepositors: '0', ...o,
  });

  const defaultResolver = (s: QbState): any[] => {
    const a = s.aliases;
    const g = s.groupBys[0] ?? '';
    const isPrev = s.params.cFrom === prevRange.fromUtc;
    if (a.includes('daysN')) return [{ k: '1', avgDays: '3.456', daysN: '4' }, { k: '3', avgDays: '10', daysN: '6' }];
    if (a.includes('depositCount') && g === 'utm.id') {
      return [
        metricRow({ k: '1', customers: '20', newCustomers: '8', depositedCustomers: '10', closedCustomers: '5', newDeposited: '3', newClosed: '2', periodDepositors: '4', periodRevenue: '1200.5', lifetimeRevenue: '5000', depositCount: '17', redepositors: '4' }),
        metricRow({ k: '2', customers: '10', depositedCustomers: '1', closedCustomers: '1', lifetimeRevenue: '300', depositCount: '1' }),
        metricRow({ k: '3', customers: '6', depositedCustomers: '3', lifetimeRevenue: '900', depositCount: '3' }),
      ];
    }
    if (a.includes('status') && a.includes('cnt')) return [{ k: '1', status: 'pending', cnt: '15' }, { k: '1', status: 'closed', cnt: '5' }, { k: '2', status: 'closed', cnt: '10' }];
    if (a.includes('p') && g === 'utm.id') {
      const isSales = s.exprByAlias.p.includes('salesUserId');
      return isSales
        ? [
            { k: '1', p: '9', customers: '12', depositedCustomers: '8', closedCustomers: '4', lifetimeRevenue: '4000' },
            { k: '1', p: '0', customers: '8', depositedCustomers: '2', closedCustomers: '1', lifetimeRevenue: '1000' },
          ]
        : [{ k: '1', p: '11', customers: '20', depositedCustomers: '10', closedCustomers: '5', lifetimeRevenue: '5000' }];
    }
    if (g === 'customer.source') return [{ k: 'Facebook', customers: '12', depositedCustomers: '6', closedCustomers: '3', lifetimeRevenue: '3000' }, { k: null, customers: '9', depositedCustomers: '4', closedCustomers: '2', lifetimeRevenue: '2000' }];
    if (a.includes('utmCount')) {
      const isSales = g.includes('salesUserId');
      const base = { customers: '15', newCustomers: '5', depositedCustomers: '8', closedCustomers: '4', periodRevenue: '700', lifetimeRevenue: '4000', utmCount: '2' };
      return isSales ? [{ k: '9', ...base }, { k: '0', ...base, lifetimeRevenue: '1000' }] : [{ k: '11', ...base }, { k: '0', ...base, lifetimeRevenue: '10' }];
    }
    if (a.includes('b') && (s.exprByAlias.b ?? '').includes('createdAt')) return [{ b: '2026-09-03', n: '3' }];
    if (a.includes('b')) return [{ b: '2026-09-04', revenue: '700', depositors: '2' }];
    if (a.includes('noUtm')) return [{ total: '50', noUtm: '12' }];
    if (a.includes('periodDepositors') && !a.includes('customers'))
      return isPrev ? [{ newCustomers: '6', periodDepositors: '2', periodRevenue: '900' }] : [{ newCustomers: '11', periodDepositors: '4', periodRevenue: '1200.5' }];
    return [];
  };

  const build = () => new ReportsUtmQualityService(customerRepo as any, statusRepo as any, utmRepo as any, userRepo as any);
  const adminReport = (q: Record<string, any> = {}) => build().getUtmQualityReport({ ...query, ...q } as any, 1, Role.ADMIN, PermissionScope.ALL);

  beforeEach(() => {
    states = [];
    resolver = defaultResolver;
    jest.clearAllMocks();
  });

  it('trả đủ dòng cho MỌI UTM (kể cả UTM trống), gộp số theo utmId và điền 0 cho status thiếu', async () => {
    const r = await adminReport();
    expect(r.utms.map((u) => u.utmId)).toEqual([1, 2, 3, 4]);
    expect(r.utms[0]).toMatchObject({ customers: 20, newCustomers: 8, depositedCustomers: 10, closedCustomers: 5, periodRevenue: 1200.5, lifetimeRevenue: 5000, depositCount: 17, redepositors: 4 });
    expect(r.utms[0].avgDaysToFirstDeposit).toBe(3.5); // làm tròn 1 chữ số
    expect(r.utms[0].byStatus).toEqual({ pending: 15, closed: 5 });
    expect(r.utms[0].newByStatus).toEqual({ pending: 15, closed: 5 }); // cohort khách mới trong kỳ (đồng bộ Date filter)
    expect(r.summary.totalNewByStatus).toEqual(r.summary.totalByStatus); // mock trả cùng số cho cả 2 pivot
    // Có đúng 1 query pivot status bị ràng buộc theo ngày tạo (cohort), 1 query còn lại không lọc ngày.
    const pivots = states.filter((st) => st.aliases.includes('status') && st.aliases.includes('cnt'));
    expect(pivots).toHaveLength(2);
    expect(pivots.filter((st) => st.wheres.includes('customer.createdAt BETWEEN :cFrom AND :cTo'))).toHaveLength(1);
    expect(r.utms[3]).toMatchObject({ customers: 0, avgDaysToFirstDeposit: null, byStatus: { pending: 0, closed: 0 } });
    expect(r.summary.utmCount).toBe(4);
    expect(r.summary.emptyUtms).toBe(1);
    expect(r.summary.totalByStatus).toEqual({ pending: 15, closed: 15 });
  });

  it('summary = CỘNG các dòng UTM (1 khách 1 UTM), TB ngày có trọng số theo số mẫu', async () => {
    const r = await adminReport();
    expect(r.summary.current).toMatchObject({ customers: 36, depositedCustomers: 14, lifetimeRevenue: 6200, depositCount: 21 });
    // (3.5*4 + 10*6) / 10 = 7.4 -> KHÔNG phải trung bình cộng đơn giản (3.5+10)/2
    expect(r.summary.current.avgDaysToFirstDeposit).toBe(7.4);
    expect(r.summary.previous).toEqual({ newCustomers: 6, periodRevenue: 900, periodDepositors: 2 });
    expect(r.summary.newCustomers).toBe(50);
    expect(r.summary.newCustomersNoUtm).toBe(12);
  });

  it('sumUtmMetrics: danh sách rỗng -> toàn 0, avg null', () => {
    expect(sumUtmMetrics([])).toMatchObject({ customers: 0, lifetimeRevenue: 0, avgDaysToFirstDeposit: null, avgDaysSamples: 0 });
  });

  it('3 góc nhìn: state lọc dòng + dropdown, còn stateCounts/stateSplit luôn đủ cả 3', async () => {
    const all = await adminReport();
    expect(all.summary.stateCounts).toEqual({ all: 4, active: 3, locked: 1 });

    const locked = await adminReport({ state: 'locked' });
    expect(locked.utms.map((u) => u.utmId)).toEqual([2]);
    expect(locked.utms[0].lockedAt).toEqual(new Date('2026-08-01'));
    expect(locked.options.utms.map((u) => u.id)).toEqual([2]);
    expect(locked.summary.stateCounts).toEqual({ all: 4, active: 3, locked: 1 });
    expect(locked.summary.stateSplit.locked).toMatchObject({ utmCount: 1, customers: 10, lifetimeRevenue: 300 });
    expect(locked.summary.stateSplit.active).toMatchObject({ utmCount: 3, customers: 26 });

    const active = await adminReport({ state: 'active' });
    expect(active.utms.map((u) => u.utmId)).toEqual([1, 3, 4]);
    expect(active.utms.every((u) => u.isActive && u.lockedAt === null)).toBe(true);
  });

  it('state áp vào SQL của số liệu tổng hợp (is_active), nhưng KHÔNG áp vào query từng UTM (để đếm cả 3 góc nhìn)', async () => {
    await adminReport({ state: 'locked', utmId: 2 });
    const perUtm = states.find((s) => s.aliases.includes('depositCount') && s.groupBys[0] === 'utm.id')!;
    expect(perUtm.wheres).not.toContain('utm.isActive = 0');
    const bySource = states.find((s) => s.groupBys[0] === 'customer.source')!;
    expect(bySource.wheres).toEqual(expect.arrayContaining(['utm.isActive = 0', 'utm.id = :fUtm']));
    expect(bySource.params.fUtm).toBe(2);
    const active = states.length;
    states = [];
    await adminReport({ state: 'active' });
    expect(states.find((s) => s.groupBys[0] === 'customer.source')!.wheres).toContain('utm.isActive = 1');
    expect(active).toBeGreaterThan(0);
  });

  it('chọn 1 UTM chỉ trả dòng UTM đó, dropdown vẫn liệt kê đủ UTM của góc nhìn', async () => {
    const r = await adminReport({ utmId: 1 });
    expect(r.utms.map((u) => u.utmId)).toEqual([1]);
    expect(r.options.utms.map((u) => u.id)).toEqual([1, 2, 3, 4]);
    expect(r.summary.current.customers).toBe(20);
  });

  it('UTM restricted: ẩn với người xem không liên quan & không có khách, hiện với Admin/Quản lý chính/có khách', async () => {
    resolver = (s) => (s.aliases.includes('depositCount') && s.groupBys[0] === 'utm.id' ? [metricRow({ k: '1', customers: '2' })] : defaultResolver(s));
    const employee = await build().getUtmQualityReport(query as any, 7, Role.EMPLOYEE, PermissionScope.OWN);
    expect(employee.utms.map((u) => u.utmId)).toEqual([1, 2, 4]); // #3 restricted + 0 khách -> ẩn
    expect(employee.summary.stateCounts.all).toBe(3);

    const primary = await build().getUtmQualityReport(query as any, 5, Role.EMPLOYEE, PermissionScope.OWN);
    expect(primary.utms.map((u) => u.utmId)).toContain(3);

    const admin = await adminReport();
    expect(admin.utms.map((u) => u.utmId)).toContain(3);

    resolver = defaultResolver; // #3 có 6 khách trong tầm nhìn -> hiện
    const withCustomers = await build().getUtmQualityReport(query as any, 7, Role.EMPLOYEE, PermissionScope.OWN);
    expect(withCustomers.utms.map((u) => u.utmId)).toContain(3);
  });

  it('gắn Quản lý chính/phụ của UTM và Sales/Marketing tham gia (top theo doanh thu, userId=0 -> user null)', async () => {
    const r = await adminReport();
    const u1 = r.utms[0];
    expect(u1.primaryManager).toMatchObject({ id: 5, name: 'Quản Lý UTM', role: 'manager', departmentColor: '#fa8c16', positionName: 'Trưởng nhóm' });
    expect(u1.secondaryManagers.map((m) => m.id)).toEqual([6]);
    expect(r.utms[1].primaryManager).toBeNull();
    expect(u1.sales.total).toBe(2);
    expect(u1.sales.top.map((p) => p.userId)).toEqual([9, 0]);
    expect(u1.sales.top[0]).toMatchObject({ customers: 12, lifetimeRevenue: 4000, user: { name: 'Sales Nine' } });
    expect(u1.sales.top[1].user).toBeNull();
    expect(u1.marketing.top[0]).toMatchObject({ userId: 11, user: { name: 'Mkt Eleven' } });
    expect(r.utms[3].sales).toEqual({ total: 0, top: [] });
  });

  it('bảng xếp hạng Sales/Marketing có tên, nhãn "chưa gán" cho userId=0 và sắp theo doanh thu giảm dần', async () => {
    const r = await adminReport();
    expect(r.bySales.map((x) => x.userName)).toEqual(['Sales Nine', '(Chưa có Sales)']);
    expect(r.bySales[0]).toMatchObject({ departmentName: 'Kinh doanh', role: 'employee', utmCount: 2, lifetimeRevenue: 4000 });
    expect(r.byMarketing.map((x) => x.userName)).toEqual(['Mkt Eleven', '(Chưa gán Marketing)']);
    expect(r.bySource.map((x) => x.source)).toEqual(['Facebook', '(Không rõ)']);
  });

  it('lọc Sales/Marketing: 0 = IS NULL, id = so sánh bằng; appliedFilters trả kèm thông tin người', async () => {
    const r = await adminReport({ salesUserId: 9, marketingUserId: 0 });
    const perUtm = states.find((s) => s.aliases.includes('depositCount') && s.groupBys[0] === 'utm.id')!;
    expect(perUtm.wheres).toEqual(expect.arrayContaining(['customer.salesUserId = :fSales', 'customer.marketingUserId IS NULL']));
    expect(perUtm.params.fSales).toBe(9);
    expect(r.appliedFilters.salesUser).toMatchObject({ id: 9, name: 'Sales Nine' });
    expect(r.appliedFilters.marketingUser).toBeNull();
  });

  it('múi giờ: khách mới dùng mốc UTC (created_at), tiền nạp dùng mốc naive (deposit_date)', async () => {
    await adminReport();
    const main = states.find((s) => s.aliases.includes('depositCount') && s.groupBys[0] === 'utm.id')!;
    expect(main.params).toMatchObject({ cFrom: range.fromUtc, cTo: range.toUtc, depFrom: range.from, depTo: range.to });
    expect(range.fromUtc).not.toBe(range.from);
    expect(main.exprByAlias.newCustomers).toContain('customer.createdAt BETWEEN :cFrom AND :cTo');
    expect(main.exprByAlias.periodRevenue).toContain('deposit.depositDate BETWEEN :depFrom AND :depTo');
  });

  it('CHỐNG LỆCH TB NGÀY: query TB ngày tới khoản nạp đầu KHÔNG join bảng deposits (join sẽ nhân dòng theo số lần nạp)', async () => {
    await adminReport();
    const days = states.find((s) => s.aliases.includes('daysN'))!;
    expect(days.leftJoins.some((j) => j[1] === 'customer.deposits')).toBe(false);
    expect(days.leftJoins.some((j) => typeof j[1] === 'string' && j[1].includes('MIN(deposit_date)'))).toBe(true);
    // Mọi số ĐẾM KHÁCH ở query tổng hợp phải DISTINCT vì có join deposits.
    const main = states.find((s) => s.aliases.includes('depositCount') && s.groupBys[0] === 'utm.id')!;
    expect(main.leftJoins.some((j) => j[1] === 'customer.deposits')).toBe(true);
    for (const alias of ['customers', 'newCustomers', 'depositedCustomers', 'closedCustomers', 'periodDepositors', 'redepositors'])
      expect(main.exprByAlias[alias]).toContain('COUNT(DISTINCT');
  });

  it('xu hướng phủ kín từng ngày của kỳ, điền 0 cho ngày trống', async () => {
    const r = await adminReport();
    expect(r.period.granularity).toBe('day');
    expect(r.trend).toHaveLength(30);
    expect(r.trend.find((t) => t.date === '2026-09-03')).toMatchObject({ newCustomers: 3, revenue: 0 });
    expect(r.trend.find((t) => t.date === '2026-09-04')).toMatchObject({ newCustomers: 0, revenue: 700, depositors: 2 });
    expect(r.trend.find((t) => t.date === '2026-09-10')).toMatchObject({ newCustomers: 0, revenue: 0, depositors: 0 });
  });

  it('kỳ dài (năm) gộp xu hướng theo THÁNG', async () => {
    const r = await adminReport({ period: 'year' });
    expect(r.period.granularity).toBe('month');
    expect(r.trend).toHaveLength(12);
  });

  it('không có dữ liệu vẫn trả dòng toàn 0 (không crash)', async () => {
    resolver = () => [];
    const r = await adminReport();
    expect(r.summary.current.customers).toBe(0);
    expect(r.summary.newCustomers).toBe(0);
    expect(r.bySales).toEqual([]);
    expect(r.byMarketing).toEqual([]);
    expect(r.utms).toHaveLength(4);
    expect(r.utms.every((u) => u.customers === 0)).toBe(true);
  });

  it('ownOnly: true cho scope=own (không phải Admin), false cho Admin', async () => {
    const own = await build().getUtmQualityReport(query as any, 7, Role.EMPLOYEE, PermissionScope.OWN);
    expect(own.ownOnly).toBe(true);
    const admin = await build().getUtmQualityReport(query as any, 1, Role.ADMIN, PermissionScope.OWN);
    expect(admin.ownOnly).toBe(false);
  });
});
