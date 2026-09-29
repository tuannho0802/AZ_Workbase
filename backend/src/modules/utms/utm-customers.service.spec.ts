import { ForbiddenException } from '@nestjs/common';
import { UtmCustomersService } from './utm-customers.service';

/** Khoá hợp đồng an toàn dữ liệu: quản lý UTM KHÔNG mở rộng quyền xem KH (luôn qua applyViewFilter). */
describe('UtmCustomersService', () => {
  const caller: any = { id: 10, role: 'employee' };
  const qb: any = {};
  ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'leftJoinAndSelect', 'orderBy', 'addOrderBy', 'skip', 'take'].forEach(
    (m) => (qb[m] = jest.fn(() => qb)),
  );
  const repo: any = { createQueryBuilder: jest.fn(() => qb) };
  const managers: any = { getManagers: jest.fn() };
  const ui: any = { getHiddenElementKeys: jest.fn().mockResolvedValue(new Set()), stripHiddenCustomerFields: jest.fn((r) => r) };
  const svc = new UtmCustomersService(repo, managers, ui);
  const calls = () => qb.where.mock.calls.length + qb.andWhere.mock.calls.length;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.createQueryBuilder.mockImplementation(() => qb);
    ui.getHiddenElementKeys.mockResolvedValue(new Set());
    ui.stripHiddenCustomerFields.mockImplementation((r: unknown) => r);
  });

  it('getCounts: scope own thêm điều kiện lọc phân quyền; map utmId -> số KH', async () => {
    qb.getRawMany = jest.fn().mockResolvedValue([{ utmId: '3', cnt: '12' }]);
    expect(await svc.getCounts(caller, 'own')).toEqual({ 3: 12 });
    expect(calls()).toBeGreaterThan(2);
  });

  it('getCounts: Admin không thêm điều kiện lọc phân quyền (chỉ deletedAt + utmId IS NOT NULL)', async () => {
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    await svc.getCounts({ id: 1, role: 'admin' } as any, 'all');
    expect(calls()).toBe(2);
  });

  it('listCustomers: không phải thành viên -> 403 từ getManagers, KHÔNG truy vấn khách', async () => {
    managers.getManagers.mockRejectedValue(new ForbiddenException());
    await expect(svc.listCustomers(3, {} as any, caller, 'own')).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('listCustomers: lọc theo utmId + scope, strip field ẩn, trả phân trang', async () => {
    managers.getManagers.mockResolvedValue({});
    qb.getManyAndCount = jest.fn().mockResolvedValue([
      [{ id: 1, name: 'A', phone: '0901234567', source: 'Facebook', status: 'pending', createdAt: new Date(), salesUser: { id: 2, name: 'S' } }],
      21,
    ]);
    const res = await svc.listCustomers(3, { page: 2, limit: 10 }, caller, 'own');
    expect(qb.andWhere).toHaveBeenCalledWith('customer.utmId = :utmId', { utmId: 3 });
    expect(calls()).toBeGreaterThan(2);
    expect(ui.stripHiddenCustomerFields).toHaveBeenCalled();
    expect(res).toEqual(expect.objectContaining({ total: 21, page: 2, totalPages: 3 }));
    expect(qb.skip).toHaveBeenCalledWith(10);
  });
});
