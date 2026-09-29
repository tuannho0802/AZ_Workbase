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

const build = (rows: any[] = [], total = 0, notes: any[] = []) => {
  const f = fakeQb(rows, total);
  const notesQb: any = {};
  for (const m of ['leftJoinAndSelect', 'where', 'orderBy', 'addOrderBy']) notesQb[m] = () => notesQb;
  notesQb.getMany = async () => notes;
  const svc = new ReportsCustomerListService({
    createQueryBuilder: () => f.qb,
    manager: { createQueryBuilder: (entity?: unknown) => (entity ? notesQb : { select: () => ({ addSelect: () => ({ from: () => ({ where: () => ({ andWhere: () => ({ groupBy: () => ({ getRawMany: async () => [] }) }) }) }) }) }) }) },
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

  it("metric cohort_closed/cohort_joined = data mới trong kỳ (UTC) + tình trạng hiện tại", async () => {
    const a = build();
    await a.svc.getList({ ...base, metric: 'cohort_closed' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(a.wheres.some((w) => w.includes('customer.createdAt BETWEEN'))).toBe(true);
    expect(a.wheres).toContain("customer.status = 'closed'");
    const b = build();
    await b.svc.getList({ ...base, metric: 'cohort_joined' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(b.wheres.some((w) => w.includes('customer_group_memberships') && w.includes('mj.joined = true'))).toBe(true);
  });

  it("metric ftd = khoản nạp ĐẦU TIÊN trong kỳ; redeposit = khoản nạp KHÔNG phải đầu tiên (dùng cột date naive)", async () => {
    const f = build();
    await f.svc.getList({ ...base, metric: 'ftd' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(f.wheres.some((w) => w.includes('d.id = (SELECT d2.id') && w.includes('ORDER BY d2.deposit_date ASC, d2.id ASC LIMIT 1'))).toBe(true);
    expect(String(f.params.depFrom).startsWith('2026-09-21')).toBe(true);
    const r = build();
    await r.svc.getList({ ...base, metric: 'redeposit' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(r.wheres.some((w) => w.includes('d.id <> (SELECT d2.id'))).toBe(true);
  });

  it('trả kèm tối đa 3 ghi chú chăm sóc gần nhất mỗi khách (mới nhất trước)', async () => {
    const mk = (id: number, customerId: number, day: number) => ({ id, customerId, note: `n${id}`, createdAt: new Date(2026, 8, day), createdByUser: { name: 'NV' } });
    const notes = [mk(5, 1, 20), mk(4, 1, 19), mk(3, 1, 18), mk(2, 1, 17), mk(9, 2, 10)];
    const { svc } = build([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], 3, notes);
    const res = await svc.getList({ ...base, metric: 'total' }, 1, Role.ADMIN, PermissionScope.ALL);
    expect(res.data[0].recentNotes.map((n) => n.id)).toEqual([5, 4, 3]);
    expect(res.data[1].recentNotes).toEqual([{ id: 9, note: 'n9', createdAt: expect.any(Date), createdByName: 'NV' }]);
    expect(res.data[2].recentNotes).toEqual([]);
    // Tổng số ghi chú tính đủ (khách 1 có 4 dù chỉ trả 3 gần nhất).
    expect(res.data.map((d) => d.noteCount)).toEqual([4, 1, 0]);
  });
});
