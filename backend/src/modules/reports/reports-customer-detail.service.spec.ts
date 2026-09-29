import { NotFoundException } from '@nestjs/common';
import { ReportsCustomerDetailService } from './reports-customer-detail.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';

function fakeQb<T>(result: T, many = false) {
  const wheres: string[] = [];
  const params: Record<string, unknown> = {};
  const qb: any = {};
  for (const m of ['leftJoinAndSelect', 'innerJoinAndSelect', 'orderBy', 'addOrderBy']) qb[m] = () => qb;
  qb.where = (sql: string, p?: Record<string, unknown>) => {
    wheres.push(sql);
    Object.assign(params, p ?? {});
    return qb;
  };
  qb.andWhere = (sql: any, p?: Record<string, unknown>) => {
    wheres.push(typeof sql === 'string' ? sql : '[Brackets]');
    Object.assign(params, p ?? {});
    return qb;
  };
  qb.getOne = async () => (many ? null : result);
  qb.getMany = async () => result;
  return { qb, wheres, params };
}

const build = (customer: any, deposits: any[], groups: any[] = [], notes: any[] = []) => {
  const c = fakeQb(customer);
  const queue = [fakeQb(deposits, true).qb, fakeQb(groups, true).qb, fakeQb(notes, true).qb];
  const svc = new ReportsCustomerDetailService({
    createQueryBuilder: () => c.qb,
    manager: { createQueryBuilder: () => queue.shift() },
  } as any);
  return { svc, ...c };
};

const customer = {
  id: 5, name: 'Khách A', phone: null, email: 'a@x.vn', source: 'Facebook', status: 'closed',
  inputDate: '2026-09-01', closedDate: '2026-09-20', createdAt: new Date('2026-09-01T03:00:00Z'),
  salesUser: { id: 2, name: 'Sales', department: { name: 'KD', color: '#111' } }, marketingUser: null, createdBy: null,
};

describe('ReportsCustomerDetailService', () => {
  it('không thấy khách (ngoài phạm vi) -> 404', async () => {
    const { svc } = build(null, []);
    await expect(svc.getDetail(9, 'customers', 1, Role.ADMIN, PermissionScope.ALL)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lịch sử nạp: giai đoạn nạp đầu/nạp lại, luỹ kế, khoảng cách ngày, tóm tắt', async () => {
    const deposits = [
      { id: 1, amount: 500, depositDate: '2026-09-05', broker: 'XM', note: null, createdBy: { id: 3, name: 'NV' } },
      { id: 2, amount: 250.5, depositDate: '2026-09-15', broker: null, note: 'thêm', createdBy: null },
      { id: 3, amount: 1000, depositDate: '2026-09-25', broker: null, note: null, createdBy: null },
    ];
    const { svc } = build(customer, deposits, [{ groupId: 7, group: { name: 'Nhóm VIP' }, joinedAt: new Date('2026-09-02T00:00:00Z') }]);
    // Mock trả 'khách' cho getOne; nhánh many=false -> cần trả về customer
    const res = await svc.getDetail(5, 'customers', 1, Role.ADMIN, PermissionScope.ALL);
    expect(res.deposits.map((d) => [d.order, d.stage, d.cumulative, d.daysSincePrevious])).toEqual([
      [1, 'ftd', 500, null],
      [2, 'redeposit', 750.5, 10],
      [3, 'redeposit', 1750.5, 10],
    ]);
    expect(res.depositSummary).toMatchObject({
      totalAmount: 1750.5,
      depositCount: 3,
      maxAmount: 1000,
      firstDepositDate: '2026-09-05',
      lastDepositDate: '2026-09-25',
      daysToFirstDeposit: 4,
      depositSpanDays: 20,
    });
    expect(res.groups).toEqual([{ id: 7, name: 'Nhóm VIP', joinedAt: expect.any(Date) }]);
    expect(res.customer.salesUser).toEqual({ id: 2, name: 'Sales', departmentName: 'KD', departmentColor: '#111' });
  });

  it('ghi chú chăm sóc (customer_notes) trả kèm, tách khỏi ghi chú chung', async () => {
    const notes = [
      { id: 9, note: 'Gọi lại chiều', noteType: 'call', isImportant: 1, createdAt: new Date('2026-09-20T03:00:00Z'), createdByUser: { id: 3, name: 'NV', email: 'x' } },
      { id: 8, note: 'Đã gửi tài liệu', noteType: 'general', isImportant: false, createdAt: new Date('2026-09-18T03:00:00Z'), createdByUser: null },
    ];
    const { svc } = build({ ...customer, note: 'Ghi chú chung' }, [], [], notes);
    const res = await svc.getDetail(5, 'customers', 1, Role.ADMIN, PermissionScope.ALL);
    expect(res.customer.note).toBe('Ghi chú chung');
    expect(res.careNotes).toEqual([
      { id: 9, note: 'Gọi lại chiều', noteType: 'call', isImportant: true, createdAt: expect.any(Date), createdBy: { id: 3, name: 'NV' } },
      { id: 8, note: 'Đã gửi tài liệu', noteType: 'general', isImportant: false, createdAt: expect.any(Date), createdBy: null },
    ]);
  });

  it('khách chưa nạp: tóm tắt = 0, các mốc null', async () => {
    const { svc } = build(customer, []);
    const res = await svc.getDetail(5, 'customers', 1, Role.ADMIN, PermissionScope.ALL);
    expect(res.deposits).toEqual([]);
    expect(res.depositSummary).toMatchObject({ totalAmount: 0, depositCount: 0, averageAmount: 0, firstDepositDate: null, daysToFirstDeposit: null });
  });

  it('scope=own: customers siết Sales chính = mình; marketing siết Marketing/Người tạo', async () => {
    const a = build(customer, []);
    await a.svc.getDetail(5, 'customers', 9, Role.EMPLOYEE, PermissionScope.OWN);
    expect(a.params.ownSalesId).toBe(9);
    const b = build(customer, []);
    await b.svc.getDetail(5, 'marketing', 9, Role.EMPLOYEE, PermissionScope.OWN);
    expect(b.wheres).toContain('[Brackets]');
  });
});
