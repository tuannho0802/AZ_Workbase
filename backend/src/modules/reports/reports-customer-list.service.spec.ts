import { ReportsCustomerListService } from './reports-customer-list.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';

/** QueryBuilder giả: ghi lại mọi điều kiện/tham số để kiểm tra từng metric dùng ĐÚNG cột ngày + múi giờ. */
function fakeQb(rows: any[] = [], total = 0) {
  const wheres: string[] = [];
  const params: Record<string, unknown> = {};
  const qb: any = {
    leftJoinAndSelect: () => qb,
    andWhere: (sql: any, p?: Record<string, unknown>) => {
      wheres.push(typeof sql === 'string' ? sql : '[Brackets]');
      Object.assign(params, p ?? {});
      return qb;
    },
    orderBy: () => qb,
    addOrderBy: () => qb,
    skip: () => qb,
    take: () => qb,
    getManyAndCount: async () => [rows, total],
  };
  return { qb, wheres, params };
}

const build = (rows: any[] = [], total = 0) => {
  const f = fakeQb(rows, total);
  const svc = new ReportsCustomerListService({
    createQueryBuilder: () => f.qb,
    manager: { createQueryBuilder: () => ({ select: () => ({ addSelect: () => ({ from: () => ({ where: () => ({ andWhere: () => ({ groupBy: () => ({ getRawMany: async () => [] }) }) }) }) }) }) }) },
  } as any);
  return { svc, ...f };
};

const base = { period: 'week' as const, anchor: '2026-09-27' };

describe('ReportsCustomerListService', () => {
  it("metric 'total' lọc theo createdAt bằng mốc UTC (không phải giờ VN naive)", async () => {
    const { svc, wheres, params } = build();
    await svc.getList({ ...base, metric: 'total' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(wheres.some((w) => w.includes('customer.createdAt BETWEEN :createdFrom AND :createdTo'))).toBe(true);
    // fromUtc = from - 7h: 21/09 00:00 VN -> 20/09 17:00 UTC.
    expect(String(params.createdFrom)).toBe('2026-09-20 17:00:00');
  });

  it("metric 'closed' dùng closedDate naive (from/to), không dùng UTC", async () => {
    const { svc, wheres, params } = build();
    await svc.getList({ ...base, metric: 'closed' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(wheres.some((w) => w.includes("customer.closedDate BETWEEN :closedFrom AND :closedTo"))).toBe(true);
    expect(String(params.closedFrom).startsWith('2026-09-21')).toBe(true);
  });

  it("metric 'unassigned_marketing' = data mới + marketingUserId IS NULL", async () => {
    const { svc, wheres } = build();
    await svc.getList({ ...base, metric: 'unassigned_marketing' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(wheres).toContain('customer.marketingUserId IS NULL');
    expect(wheres.some((w) => w.includes('customer.createdAt BETWEEN'))).toBe(true);
  });

  it('scope=own: context customers siết Sales chính = mình; context marketing siết Marketing/Người tạo', async () => {
    const a = build();
    await a.svc.getList({ ...base, metric: 'total', context: 'customers' }, 9, Role.EMPLOYEE, PermissionScope.OWN);
    expect(a.params.ownSalesId).toBe(9);
    const b = build();
    await b.svc.getList({ ...base, metric: 'total', context: 'marketing' }, 9, Role.EMPLOYEE, PermissionScope.OWN);
    expect(b.wheres).toContain('[Brackets]');
  });

  it('marketingUserId=0 -> IS NULL; quick=no_phone; search escape wildcard', async () => {
    const { svc, wheres, params } = build();
    await svc.getList({ ...base, metric: 'total', marketingUserId: 0, quick: 'no_phone', search: '5%_' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(wheres).toContain('customer.marketingUserId IS NULL');
    expect(wheres.some((w) => w.includes("customer.phone = ''"))).toBe(true);
    expect(params.fSearch).toBe('%5\\%\\_%');
  });

  it('ít data: 0 khách -> totalPages tối thiểu 1, data rỗng; 1 khách map đúng user + phòng ban', async () => {
    const empty = await build().svc.getList({ ...base, metric: 'total' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(empty).toMatchObject({ total: 0, totalPages: 1, page: 1, limit: 10, data: [] });

    const one = await build(
      [{ id: 1, name: 'A', createdAt: new Date(), salesUser: { id: 2, name: 'S', department: { name: 'KD', color: '#111111' } }, marketingUser: null, createdBy: null }],
      1,
    ).svc.getList({ ...base, metric: 'total' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(one.data[0].salesUser).toEqual({ id: 2, name: 'S', departmentName: 'KD', departmentColor: '#111111' });
    expect(one.data[0].marketingUser).toBeNull();
  });
});
