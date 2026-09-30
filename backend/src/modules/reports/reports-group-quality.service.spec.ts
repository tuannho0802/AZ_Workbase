import { ReportsGroupQualityService } from './reports-group-quality.service';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
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
  joins: any[][];
  params: Record<string, any>;
  wheres: string[];
}

const query = { period: 'month' as const, anchor: '2026-09-15' };
const range = resolveReportRange(query);
const prevRange = resolvePreviousReportRange(query);

describe('ReportsGroupQualityService', () => {
  let states: QbState[];
  let resolver: (s: QbState) => any[];

  function createQb(): any {
    const s: QbState = { aliases: [], exprByAlias: {}, groupBys: [], joins: [], params: {}, wheres: [] };
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
          if (prop === 'innerJoin' || prop === 'leftJoin')
            return (...args: any[]) => {
              if (prop === 'innerJoin') s.joins.push(args);
              if (args[3]) Object.assign(s.params, args[3]);
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
          return () => qb; // orWhere, orderBy, ... không quan trọng cho test
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
  const groupRepo = {
    find: jest.fn(async () => [
      { id: 1, categoryId: 10, name: 'Zalo HN', isActive: true, primaryManagerId: 5, category: { name: 'Zalo', color: '#1677ff' } },
      { id: 2, categoryId: 10, name: 'Zalo HCM', isActive: true, primaryManagerId: null, category: { name: 'Zalo', color: '#1677ff' } },
      { id: 3, categoryId: 11, name: 'Telegram VIP', isActive: false, primaryManagerId: null, category: { name: 'Telegram', color: '#13c2c2' } },
    ]),
  };
  const categoryRepo = { find: jest.fn(async () => [{ id: 10, name: 'Zalo', color: '#1677ff' }, { id: 11, name: 'Telegram', color: '#13c2c2' }]) };
  const userRepo = {
    find: jest.fn(async () => [
      { id: 5, name: 'Quản Lý Nhóm', role: 'manager', department: { name: 'Kinh doanh', color: '#fa8c16' }, position: { name: 'Trưởng nhóm', color: '#722ed1' } },
      { id: 9, name: 'Sales Nine', role: 'employee', department: { name: 'Kinh doanh', color: '#fa8c16' }, position: null },
    ]),
  };

  const metricRow = (o: Record<string, string>) => ({
    members: '0', newJoins: '0', depositedMembers: '0', closedMembers: '0', newJoinsDeposited: '0',
    newJoinsClosed: '0', periodDepositors: '0', periodRevenue: '0', lifetimeRevenue: '0', avgDays: null, ...o,
  });

  const defaultResolver = (s: QbState): any[] => {
    const a = s.aliases;
    const g = s.groupBys[0] ?? '';
    // Query theo nguồn cũng có alias newJoins/members (cohort) -> phải xét TRƯỚC nhánh metrics.
    if (g === 'customer.source') return [{ k: 'Facebook', members: '12', depositedMembers: '6', closedMembers: '3', lifetimeRevenue: '3000' }, { k: null, members: '9', depositedMembers: '4', closedMembers: '2', lifetimeRevenue: '2000' }];
    if (a.includes('newJoins') && a.includes('members')) {
      const isPrev = s.params.joinFrom === prevRange.fromUtc;
      if (g.includes('membership.group_id')) {
        return [
          metricRow({ k: '1', members: '20', newJoins: '8', depositedMembers: '10', closedMembers: '5', newJoinsDeposited: '3', newJoinsClosed: '2', periodDepositors: '4', periodRevenue: '1200.5', lifetimeRevenue: '5000', avgDays: '3.456' }),
          metricRow({ k: '3', members: '2', lifetimeRevenue: '0' }),
        ];
      }
      return isPrev
        ? [metricRow({ members: '30', newJoins: '6', periodDepositors: '2', periodRevenue: '900' })]
        : [metricRow({ members: '21', newJoins: '8', depositedMembers: '10', closedMembers: '5', periodDepositors: '4', periodRevenue: '1200.5', lifetimeRevenue: '5000' })];
    }
    if (a.includes('status') && a.includes('cnt')) return [{ k: '1', status: 'pending', cnt: '15' }, { k: '1', status: 'closed', cnt: '5' }];
    if (g.includes('salesUserId')) return [{ k: '9', members: '15', depositedMembers: '8', closedMembers: '4', lifetimeRevenue: '4000' }, { k: '0', members: '6', depositedMembers: '2', closedMembers: '1', lifetimeRevenue: '1000' }];
    if (a.includes('b') && (s.exprByAlias.b ?? '').includes('joined_at')) return [{ b: '2026-09-03', n: '3' }];
    if (a.includes('b')) return [{ b: '2026-09-04', revenue: '700', depositors: '2' }];
    if (a.includes('noGroup')) return [{ total: '50', noGroup: '12' }];
    return [];
  };

  const build = () =>
    new ReportsGroupQualityService(customerRepo as any, statusRepo as any, groupRepo as any, categoryRepo as any, userRepo as any);

  beforeEach(() => {
    states = [];
    resolver = defaultResolver;
    jest.clearAllMocks();
  });

  it('trả đủ dòng cho MỌI nhóm (kể cả nhóm trống), gộp số theo groupId và điền 0 cho status thiếu', async () => {
    const r = await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.groups.map((g) => g.groupId)).toEqual([1, 2, 3]);
    const g1 = r.groups[0];
    expect(g1).toMatchObject({ members: 20, newJoins: 8, depositedMembers: 10, closedMembers: 5, periodRevenue: 1200.5, lifetimeRevenue: 5000 });
    expect(g1.avgDaysToFirstDeposit).toBe(3.5); // làm tròn 1 chữ số
    expect(g1.byStatus).toEqual({ pending: 15, closed: 5 });
    expect(g1.newJoinsByStatus).toEqual({ pending: 15, closed: 5 }); // cohort join trong kỳ (đồng bộ Date filter)
    // nhóm 2 không có dòng nào -> toàn 0, byStatus điền 0
    expect(r.groups[1]).toMatchObject({ members: 0, newJoins: 0, avgDaysToFirstDeposit: null, byStatus: { pending: 0, closed: 0 } });
    expect(r.summary.groupCount).toBe(3);
    expect(r.summary.emptyGroups).toBe(1); // chỉ nhóm 2 (nhóm 3 có 2 thành viên)
    expect(r.summary.totalByStatus).toEqual({ pending: 15, closed: 5 });
  });

  it('gắn Tag quản lý chính (vai trò/phòng ban/vị trí) và tên Sales, "(Chưa có Sales)" cho userId=0', async () => {
    const r = await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.groups[0].primaryManager).toMatchObject({ id: 5, name: 'Quản Lý Nhóm', role: 'manager', departmentColor: '#fa8c16', positionName: 'Trưởng nhóm' });
    expect(r.groups[1].primaryManager).toBeNull();
    expect(r.bySales.map((s) => s.userName)).toEqual(['Sales Nine', '(Chưa có Sales)']);
    expect(r.bySales[0]).toMatchObject({ departmentName: 'Kinh doanh', role: 'employee' });
    expect(r.bySource.map((s) => s.source)).toEqual(['Facebook', '(Không rõ)']);
  });

  it('summary dùng dòng tổng DISTINCT khách (không cộng dồn dòng nhóm) và so với kỳ trước', async () => {
    const r = await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.summary.current.members).toBe(21); // ≠ 20 + 2 (tổng dòng nhóm): khách ở 2 nhóm chỉ đếm 1 lần
    expect(r.summary.previous).toEqual({ newJoins: 6, periodRevenue: 900, periodDepositors: 2 });
    expect(r.summary.newCustomers).toBe(50);
    expect(r.summary.newCustomersNoGroup).toBe(12);
  });

  it('múi giờ: newJoins dùng mốc UTC (joined_at), tiền nạp dùng mốc naive (deposit_date)', async () => {
    await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    const main = states.find((s) => s.aliases.includes('members') && s.params.joinFrom === range.fromUtc);
    expect(main).toBeDefined();
    expect(main!.params).toMatchObject({ joinFrom: range.fromUtc, joinTo: range.toUtc, depFrom: range.from, depTo: range.to });
    expect(range.fromUtc).not.toBe(range.from);
    expect(main!.exprByAlias.newJoins).toContain('membership.joined_at BETWEEN :joinFrom AND :joinTo');
    expect(main!.exprByAlias.periodRevenue).toContain('deposit.depositDate BETWEEN :depFrom AND :depTo');
  });

  it('CHỐNG NHÂN ĐÔI TIỀN: chỉ query GROUP BY nhóm mới join thẳng membership; mọi query tổng hợp khác join bảng thu gọn 1 dòng/khách', async () => {
    await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    const usesDirectMembership = (s: QbState) => s.joins.some((j) => j[0] === CustomerGroupMembership);
    const usesCollapsed = (s: QbState) => s.joins.some((j) => typeof j[0] === 'string' && j[0].startsWith('(SELECT') && j[0].includes('GROUP BY m.customer_id'));
    for (const s of states) {
      if (s.aliases.includes('noGroup')) continue; // truy vấn khách chưa join nhóm - không join membership
      const perGroup = s.groupBys.some((g) => g.includes('membership.group_id'));
      if (perGroup) expect(usesDirectMembership(s)).toBe(true);
      else expect(usesCollapsed(s)).toBe(true);
    }
  });

  it('lọc groupId/categoryId áp cả nhánh join thẳng lẫn bảng thu gọn', async () => {
    await build().getGroupQualityReport({ ...query, groupId: 1, categoryId: 10 }, 1, Role.ADMIN, PermissionScope.ALL);
    const perGroup = states.find((s) => s.groupBys.some((g) => g.includes('membership.group_id')) && s.aliases.includes('members'))!;
    expect(perGroup.wheres).toEqual(expect.arrayContaining(['lg.id = :fGroup', 'lg.category_id = :fCategory']));
    const collapsed = states.find((s) => s.joins.some((j) => typeof j[0] === 'string' && j[0].startsWith('(SELECT')))!;
    const sub = collapsed.joins.find((j) => typeof j[0] === 'string')!;
    expect(sub[0]).toContain('g.id = :fGroup');
    expect(sub[0]).toContain('g.category_id = :fCategory');
    expect(sub[3]).toEqual({ fGroup: 1, fCategory: 10 });
  });

  it('chọn 1 nhóm chỉ trả dòng của nhóm đó, nhưng dropdown vẫn liệt kê đủ nhóm cùng Category', async () => {
    const r = await build().getGroupQualityReport({ ...query, groupId: 1 }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.groups.map((g) => g.groupId)).toEqual([1]);
    expect(r.options.groups.map((g) => g.id)).toEqual([1, 2, 3]);
    const cat = await build().getGroupQualityReport({ ...query, categoryId: 10 }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(cat.groups.map((g) => g.groupId)).toEqual([1, 2]);
    expect(cat.options.groups.map((g) => g.id)).toEqual([1, 2]);
    expect(cat.options.categories.map((c) => c.id)).toEqual([10, 11]);
  });

  it('xu hướng phủ kín từng ngày của kỳ, điền 0 cho ngày trống', async () => {
    const r = await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.period.granularity).toBe('day');
    expect(r.trend).toHaveLength(30);
    expect(r.trend.find((t) => t.date === '2026-09-03')).toMatchObject({ newJoins: 3, revenue: 0 });
    expect(r.trend.find((t) => t.date === '2026-09-04')).toMatchObject({ newJoins: 0, revenue: 700, depositors: 2 });
    expect(r.trend.find((t) => t.date === '2026-09-10')).toMatchObject({ newJoins: 0, revenue: 0, depositors: 0 });
  });

  it('không có dữ liệu vẫn trả dòng tổng toàn 0 (không crash)', async () => {
    resolver = () => [];
    const r = await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.summary.current.members).toBe(0);
    expect(r.summary.newCustomers).toBe(0);
    expect(r.bySales).toEqual([]);
    expect(r.groups.every((g) => g.members === 0)).toBe(true);
  });

  it('ownOnly: true cho scope=own (không phải Admin), false cho Admin', async () => {
    const own = await build().getGroupQualityReport(query, 7, Role.EMPLOYEE, PermissionScope.OWN);
    expect(own.ownOnly).toBe(true);
    const admin = await build().getGroupQualityReport(query, 1, Role.ADMIN, PermissionScope.OWN);
    expect(admin.ownOnly).toBe(false);
  });
});
