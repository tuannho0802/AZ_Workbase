import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsMarketingService } from './reports-marketing.service';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { resolvePreviousReportRange, resolveReportRange, spanDaysOf } from './report-range.util';

/**
 * CHIẾN LƯỢC MOCK: service chạy nhiều query SONG SONG (Promise.all) nên KHÔNG dùng hàng đợi FIFO.
 * Mỗi QueryBuilder giả ghi lại alias/biểu thức select, group by, where; `resolver` quyết định
 * trả gì dựa trên "hình dạng" query (không phụ thuộc thứ tự gọi).
 */
interface QbState {
  aliases: string[];
  exprByAlias: Record<string, string>;
  groupBys: string[];
  wheres: Array<{ cond: any; params?: any }>;
  joins: any[][];
  params: Record<string, any>;
}

describe('ReportsMarketingService', () => {
  let service: ReportsMarketingService;
  let states: QbState[];
  let resolver: (s: QbState) => any[];

  function createQb(): any {
    const s: QbState = { aliases: [], exprByAlias: {}, groupBys: [], wheres: [], joins: [], params: {} };
    states.push(s);
    const qb: any = {};
    const sel = (expr: string, alias: string) => {
      s.aliases.push(alias);
      s.exprByAlias[alias] = expr;
      return qb;
    };
    qb.select = jest.fn(sel);
    qb.addSelect = jest.fn(sel);
    qb.groupBy = jest.fn((e: string) => {
      s.groupBys.push(e);
      return qb;
    });
    qb.addGroupBy = jest.fn((e: string) => {
      s.groupBys.push(e);
      return qb;
    });
    qb.andWhere = jest.fn((cond: any, params?: any) => {
      s.wheres.push({ cond, params });
      if (params) Object.assign(s.params, params);
      return qb;
    });
    qb.leftJoin = jest.fn(() => qb);
    qb.innerJoin = jest.fn((...args: any[]) => {
      s.joins.push(args);
      return qb;
    });
    qb.setParameters = jest.fn((p: any) => {
      Object.assign(s.params, p);
      return qb;
    });
    qb.getRawMany = jest.fn(() => Promise.resolve(resolver(s)));
    qb.getRawOne = jest.fn(() => Promise.resolve(resolver(s)[0] ?? null));
    return qb;
  }

  const customerRepo = { createQueryBuilder: jest.fn(() => createQb()) };
  const statusRepo = { find: jest.fn() };
  const userRepo = { find: jest.fn() };

  /** Resolver mặc định: 2 Marketing (7, 9) + bucket chưa gán (0); user 9 chỉ có deposit (không có data mới). */
  const defaultResolver = (s: QbState): any[] => {
    const a = s.aliases;
    const g = s.groupBys[0] ?? '';
    const isMarketingGroup = g.includes('marketingUserId');
    const isCreatorGroup = g.includes('createdById');
    const isSourceGroup = g.includes('customer.source');

    if (a.includes('cohortDeposited')) {
      if (isMarketingGroup)
        return [
          { k: '7', total: '10', closed: '2', cohortDeposited: '4' },
          { k: '0', total: '5', closed: '0', cohortDeposited: '0' },
        ];
      if (isCreatorGroup) return [{ k: '3', total: '15', closed: '2', cohortDeposited: '4' }];
      if (isSourceGroup) return [{ k: 'Facebook', total: '15', closed: '2', cohortDeposited: '4' }];
      return [{ total: '15', closed: '2', cohortDeposited: '4' }];
    }
    if (a.includes('joined')) {
      if (isMarketingGroup) return [{ k: '7', joined: '2' }];
      return [];
    }
    if (a.includes('depositors') && a.includes('revenue') && !a.includes('b')) {
      if (isMarketingGroup)
        return [
          { k: '7', depositors: '3', revenue: '1500.50' },
          { k: '9', depositors: '1', revenue: '200' },
        ];
      if (isCreatorGroup) return [{ k: '3', depositors: '4', revenue: '1700.5' }];
      if (isSourceGroup) return [{ k: 'Facebook', depositors: '4', revenue: '1700.5' }];
      return [{ depositors: '4', revenue: '1700.5' }];
    }
    if (a.includes('cnt') && a.includes('status')) {
      if (isMarketingGroup)
        return [
          { k: '7', status: 'closed', cnt: '2' },
          { k: '7', status: 'pending', cnt: '8' },
          { k: '0', status: 'pending', cnt: '5' },
        ];
      return [{ k: '3', status: 'pending', cnt: '13' }];
    }
    if (a.includes('b')) {
      const e = s.exprByAlias['b'];
      if (e.includes('createdAt')) return [{ b: '2026-09-02', n: '4' }];
      if (e.includes('closedDate')) return [{ b: '2026-09-03', n: '1' }];
      return [{ b: '2026-09-03', revenue: '500', depositors: '2' }];
    }
    if (a.includes('noMarketing')) return [{ noMarketing: '5', same: '6', different: '4' }];
    if (a.includes('id') && s.exprByAlias['id'] === 'customer.marketingUserId') return [{ id: '7' }, { id: '9' }];
    if (a.includes('id') && s.exprByAlias['id'] === 'customer.createdById') return [{ id: '3' }];
    if (a.includes('id') && s.exprByAlias['id'] === 'customer.departmentId') return [{ id: '1', name: 'Marketing' }];
    if (a.includes('source')) return [{ source: 'Facebook' }, { source: 'TikTok' }];
    return [];
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    states = [];
    resolver = defaultResolver;
    customerRepo.createQueryBuilder.mockImplementation(() => createQb());
    statusRepo.find.mockResolvedValue([
      { code: 'pending', name: 'Chờ xử lý', color: 'gold' },
      { code: 'closed', name: 'Đã chốt', color: 'green' },
    ]);
    userRepo.find.mockResolvedValue([
      { id: 7, name: 'Mai Marketing', departmentId: 1, department: { name: 'Marketing' } },
      { id: 9, name: 'Nam Marketing', departmentId: 1, department: { name: 'Marketing' } },
      { id: 3, name: 'Lan Creator', departmentId: 1, department: { name: 'Marketing' } },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsMarketingService,
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
        { provide: getRepositoryToken(CustomerStatus), useValue: statusRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = module.get(ReportsMarketingService);
  });

  const monthQuery = { period: 'month' as const, anchor: '2026-09-15' };

  describe('dòng theo Marketing phụ trách', () => {
    it('gộp main/joined/deposit theo userId, kể cả user CHỈ có deposit và bucket chưa gán', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);

      const mai = r.marketing.find((x) => x.userId === 7)!;
      expect(mai).toMatchObject({
        userName: 'Mai Marketing',
        departmentName: 'Marketing',
        totalCustomers: 10,
        closedCustomers: 2,
        joinedGroupCustomers: 2,
        depositedCustomers: 3,
        revenue: 1500.5,
        cohortDepositedCustomers: 4,
      });
      expect(mai.byStatus).toEqual({ pending: 8, closed: 2 });

      const nam = r.marketing.find((x) => x.userId === 9)!;
      expect(nam.totalCustomers).toBe(0);
      expect(nam.revenue).toBe(200);
      expect(nam.byStatus).toEqual({ pending: 0, closed: 0 });

      const unassigned = r.marketing.find((x) => x.userId === 0)!;
      expect(unassigned.userName).toBe('(Chưa gán Marketing)');
      expect(r.summary.unassignedMarketingCustomers).toBe(5);
    });

    it('sắp xếp theo doanh thu giảm dần', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      const revenues = r.marketing.map((x) => x.revenue);
      expect(revenues).toEqual([...revenues].sort((a, b) => b - a));
    });
  });

  describe('chiều Người tạo + đối soát', () => {
    it('trả dòng theo người tạo và bảng đối soát', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.creators).toHaveLength(1);
      expect(r.creators[0]).toMatchObject({ userId: 3, userName: 'Lan Creator', totalCustomers: 15, revenue: 1700.5 });
      expect(r.attribution).toEqual({ noMarketing: 5, sameCreatorAndMarketing: 6, differentCreatorAndMarketing: 4 });
    });
  });

  describe('summary + so sánh kỳ trước', () => {
    it('kỳ trước là tháng 8 khi xem tháng 9', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.summary.current.revenue).toBe(1700.5);
      expect(r.summary.current.depositedCustomers).toBe(4);
      expect(r.previousPeriod.from.slice(0, 10)).toBe('2026-08-01');
      expect(r.previousPeriod.to.slice(0, 10)).toBe('2026-08-31');
    });

    it('totalByStatus cộng dồn từ pivot status', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.summary.totalByStatus).toEqual({ pending: 13, closed: 2 });
    });
  });

  describe('HỒI QUY múi giờ (cùng quy ước ReportsService)', () => {
    it('created_at/joined_at dùng fromUtc/toUtc; closed_date/deposit_date dùng from/to naive', async () => {
      await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      const range = resolveReportRange(monthQuery);
      const main = states.find((s) => s.aliases.includes('cohortDeposited') && s.params.createdFrom === range.fromUtc)!;
      expect(main).toBeDefined();
      expect(main.params).toMatchObject({
        createdFrom: range.fromUtc,
        createdTo: range.toUtc,
        closedFrom: range.from,
        closedTo: range.to,
      });
      expect(range.fromUtc).toBe('2026-08-31 17:00:00');
      expect(range.from).toBe('2026-09-01 00:00:00');

      const joined = states.find((s) => s.aliases.includes('joined'))!;
      expect(joined.joins[0][3]).toEqual({ joinedFrom: range.fromUtc, joinedTo: range.toUtc });

      const deposit = states.find((s) => s.aliases.includes('depositors') && !s.aliases.includes('b'))!;
      expect(deposit.params).toMatchObject({ depFrom: range.from, depTo: range.to });
    });
  });

  describe('bộ lọc', () => {
    it('marketingUserId=0 -> IS NULL, không truyền tham số', async () => {
      await service.getMarketingReport({ ...monthQuery, marketingUserId: 0 }, 1, Role.ADMIN, PermissionScope.ALL);
      const main = states.find((s) => s.aliases.includes('cohortDeposited'))!;
      expect(main.wheres.some((w) => w.cond === 'customer.marketingUserId IS NULL')).toBe(true);
      expect(main.params.fMarketing).toBeUndefined();
    });

    it('marketingUserId=7 + createdById=3 + source + departmentId -> tham số hoá đúng', async () => {
      await service.getMarketingReport(
        { ...monthQuery, marketingUserId: 7, createdById: 3, source: 'Facebook', departmentId: 2 },
        1,
        Role.ADMIN,
        PermissionScope.ALL,
      );
      const main = states.find((s) => s.aliases.includes('cohortDeposited'))!;
      expect(main.params).toMatchObject({ fMarketing: 7, fCreator: 3, fSource: 'Facebook', fDept: 2 });
    });

    it('options dropdown KHÔNG bị lọc theo user đã chọn', async () => {
      await service.getMarketingReport({ ...monthQuery, marketingUserId: 7 }, 1, Role.ADMIN, PermissionScope.ALL);
      const optionQ = states.find((s) => s.exprByAlias['id'] === 'customer.marketingUserId')!;
      expect(optionQ.params.fMarketing).toBeUndefined();
    });

    it('options trả tên kèm phòng ban', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.options.marketers.map((m) => m.name)).toEqual(['Mai Marketing', 'Nam Marketing']);
      expect(r.options.departments).toEqual([{ id: 1, name: 'Marketing' }]);
      expect(r.options.sources).toEqual(['Facebook', 'TikTok']);
    });
  });

  describe('phân quyền', () => {
    it("scope='own' -> chỉ dòng của chính mình, ownOnly=true, options chỉ còn mình", async () => {
      const r = await service.getMarketingReport(monthQuery, 7, Role.EMPLOYEE, PermissionScope.OWN);
      expect(r.ownOnly).toBe(true);
      expect(r.marketing.map((x) => x.userId)).toEqual([7]);
      expect(r.creators).toHaveLength(0);
      expect(r.options.marketers.map((m) => m.id)).toEqual([7]);
      const main = states.find((s) => s.aliases.includes('cohortDeposited'))!;
      expect(main.wheres.some((w) => typeof w.cond === 'object')).toBe(true);
    });

    it("scope='own' nhưng là Admin -> KHÔNG bị siết", async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.OWN);
      expect(r.ownOnly).toBe(false);
      expect(r.marketing.length).toBeGreaterThan(1);
    });

    it("scope='all' -> ownOnly=false", async () => {
      const r = await service.getMarketingReport(monthQuery, 5, Role.ASSISTANT, PermissionScope.ALL);
      expect(r.ownOnly).toBe(false);
    });
  });

  describe('xu hướng', () => {
    it('kỳ tháng -> theo NGÀY, điền 0 cho ngày trống (30 điểm cho tháng 9)', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.period.granularity).toBe('day');
      expect(r.trend).toHaveLength(30);
      const d3 = r.trend.find((t) => t.date === '2026-09-03')!;
      expect(d3).toMatchObject({ closedCustomers: 1, revenue: 500, depositedCustomers: 2, newCustomers: 0 });
      expect(r.trend.find((t) => t.date === '2026-09-02')!.newCustomers).toBe(4);
      expect(r.trend.find((t) => t.date === '2026-09-10')!).toMatchObject({ newCustomers: 0, revenue: 0 });
    });

    it('kỳ > 92 ngày -> gộp theo THÁNG', async () => {
      const r = await service.getMarketingReport(
        { period: 'custom', customFrom: '2026-01-01', customTo: '2026-09-30' },
        1,
        Role.ADMIN,
        PermissionScope.ALL,
      );
      expect(r.period.granularity).toBe('month');
      expect(r.trend).toHaveLength(9);
      expect(r.trend[0].date).toBe('2026-01');
    });

    it('bỏ qua dòng ngoài kỳ (không tạo điểm lạ)', async () => {
      resolver = (s) => (s.aliases.includes('b') ? [{ b: '1999-01-01', n: '9' }] : defaultResolver(s));
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.trend.every((t) => t.newCustomers === 0)).toBe(true);
    });
  });

  describe('nguồn', () => {
    it('trả chỉ số theo nguồn', async () => {
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.bySource).toEqual([expect.objectContaining({ source: 'Facebook', totalCustomers: 15, revenue: 1700.5 })]);
    });
  });

  describe('không có dữ liệu', () => {
    it('mọi query rỗng -> summary bằng 0, các mảng rỗng, không throw', async () => {
      resolver = () => [];
      statusRepo.find.mockResolvedValue([]);
      const r = await service.getMarketingReport(monthQuery, 1, Role.ADMIN, PermissionScope.ALL);
      expect(r.summary.current).toEqual({
        totalCustomers: 0,
        closedCustomers: 0,
        joinedGroupCustomers: 0,
        depositedCustomers: 0,
        revenue: 0,
        cohortDepositedCustomers: 0,
      });
      expect(r.marketing).toEqual([]);
      expect(r.creators).toEqual([]);
      expect(userRepo.find).not.toHaveBeenCalled();
    });
  });
});

describe('report-range.util', () => {
  it('resolvePreviousReportRange: tuần -> tuần trước (T2→CN)', () => {
    const cur = resolveReportRange({ period: 'week', anchor: '2026-09-16' });
    const prev = resolvePreviousReportRange({ period: 'week', anchor: '2026-09-16' });
    expect(cur.from.slice(0, 10)).toBe('2026-09-14');
    expect(prev.from.slice(0, 10)).toBe('2026-09-07');
    expect(prev.to.slice(0, 10)).toBe('2026-09-13');
  });

  it('resolvePreviousReportRange: quý 3 -> quý 2; năm -> năm trước', () => {
    const q = resolvePreviousReportRange({ period: 'quarter', anchor: '2026-09-15' });
    expect(q.from.slice(0, 10)).toBe('2026-04-01');
    expect(q.to.slice(0, 10)).toBe('2026-06-30');
    const y = resolvePreviousReportRange({ period: 'year', anchor: '2026-09-15' });
    expect(y.from.slice(0, 10)).toBe('2025-01-01');
    expect(y.to.slice(0, 10)).toBe('2025-12-31');
  });

  it('resolvePreviousReportRange: tháng 3 -> tháng 2 (28 ngày)', () => {
    const p = resolvePreviousReportRange({ period: 'month', anchor: '2026-03-10' });
    expect(p.from.slice(0, 10)).toBe('2026-02-01');
    expect(p.to.slice(0, 10)).toBe('2026-02-28');
  });

  it('resolvePreviousReportRange: custom -> cùng số ngày, liền trước', () => {
    const prev = resolvePreviousReportRange({ period: 'custom', customFrom: '2026-09-10', customTo: '2026-09-19' });
    expect(prev.from.slice(0, 10)).toBe('2026-08-31');
    expect(prev.to.slice(0, 10)).toBe('2026-09-09');
    expect(spanDaysOf(prev)).toBe(10);
  });

  it('spanDaysOf tính cả 2 đầu', () => {
    expect(spanDaysOf(resolveReportRange({ period: 'month', anchor: '2026-09-15' }))).toBe(30);
  });
});
