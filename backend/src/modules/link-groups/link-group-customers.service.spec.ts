import { ForbiddenException } from '@nestjs/common';
import { LinkGroupCustomersService } from './link-group-customers.service';

/** QueryBuilder giả: chuỗi hoá mọi hàm, ghi lại lời gọi để assert. */
function fakeQb(result: { many?: any[]; count?: number; raw?: any[] }) {
  const qb: any = { calls: [] as Array<[string, any[]]> };
  const chain = ['innerJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'offset', 'limit',
    'select', 'addSelect', 'groupBy'];
  chain.forEach((fn) => {
    qb[fn] = jest.fn((...args: any[]) => {
      qb.calls.push([fn, args]);
      return qb;
    });
  });
  qb.getManyAndCount = jest.fn().mockResolvedValue([result.many ?? [], result.count ?? 0]);
  qb.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  qb.getRawMany = jest.fn().mockResolvedValue(result.raw ?? []);
  return qb;
}

describe('LinkGroupCustomersService', () => {
  const caller = { id: 7, role: 'employee', isRootAdmin: false, departmentId: 2, positionId: 3 };
  let managers: any;
  let ui: any;
  let membershipRepo: any;
  let customerRepo: any;
  let service: LinkGroupCustomersService;

  beforeEach(() => {
    managers = {
      listManagedByMe: jest.fn(),
      getManagers: jest.fn().mockResolvedValue({}),
    };
    ui = {
      getHiddenElementKeys: jest.fn().mockResolvedValue(new Set()),
      stripHiddenCustomerFields: jest.fn((c: any) => c),
    };
    membershipRepo = { createQueryBuilder: jest.fn() };
    customerRepo = { createQueryBuilder: jest.fn() };
    service = new LinkGroupCustomersService(membershipRepo, customerRepo, managers, ui);
  });

  describe('getCounts', () => {
    it('trả 0 cho nhóm chưa có khách và đúng số cho nhóm có khách', async () => {
      managers.listManagedByMe.mockResolvedValue([{ groupId: 1 }, { groupId: 2 }]);
      const qb = fakeQb({ raw: [{ groupId: '2', cnt: '5' }] });
      membershipRepo.createQueryBuilder.mockReturnValue(qb);

      expect(await service.getCounts(caller)).toEqual({ 1: 0, 2: 5 });
      // chỉ đếm khách chưa xoá mềm + đã join
      expect(qb.calls.some(([fn, a]: any) => fn === 'innerJoin' && String(a[2]).includes('deletedAt IS NULL'))).toBe(true);
      expect(qb.calls.some(([fn, a]: any) => fn === 'where' && a[1]?.joined === 1)).toBe(true);
    });

    it('không có nhóm nào được xem -> {} và không query DB', async () => {
      managers.listManagedByMe.mockResolvedValue([]);
      expect(await service.getCounts(caller)).toEqual({});
      expect(membershipRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('listCustomers', () => {
    it('ném lỗi (403) khi không có quyền xem nhóm - không chạm vào bảng customers', async () => {
      managers.getManagers.mockRejectedValue(new ForbiddenException());
      await expect(service.listCustomers(1, {}, caller)).rejects.toThrow(ForbiddenException);
      expect(customerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('áp filter + phân trang, gắn joinedAt, trả metadata', async () => {
      const joinedAt = new Date('2026-09-01T00:00:00Z');
      const customerQb = fakeQb({
        many: [{ id: 10, name: 'A', phone: '0901', source: 'Zalo', status: 'closed', createdAt: new Date(),
          salesUser: { id: 3, name: 'S', extra: 'x' }, marketingUser: null }],
        count: 23,
      });
      const membershipQb = fakeQb({ many: [{ customerId: 10, joinedAt }] });
      customerRepo.createQueryBuilder.mockReturnValue(customerQb);
      membershipRepo.createQueryBuilder.mockReturnValue(membershipQb);

      const res = await service.listCustomers(
        5,
        { page: 2, limit: 10, search: 'A', status: 'closed', salesUserId: 3, dateFrom: '2026-01-01' },
        caller,
      );

      expect(managers.getManagers).toHaveBeenCalledWith(5, 7, 'employee', false);
      expect(res).toMatchObject({ total: 23, page: 2, limit: 10, totalPages: 3 });
      expect(res.data[0]).toMatchObject({ id: 10, joinedAt, salesUser: { id: 3, name: 'S' } });
      expect((res.data[0].salesUser as any).extra).toBeUndefined(); // chỉ lộ id/name
      expect(customerQb.offset).toHaveBeenCalledWith(10);
      expect(customerQb.limit).toHaveBeenCalledWith(10);
      const where = customerQb.calls.filter(([fn]: any) => fn === 'andWhere').map(([, a]: any) => a[0]).join('|');
      expect(where).toContain('customer.status = :status');
      expect(where).toContain('customer.salesUserId = :salesUserId');
      expect(where).toContain('customer.inputDate >= :dateFrom');
      expect(where).toContain('customer.name LIKE :kw');
    });

    it('áp UI Visibility (strip field bị ẩn) cho từng dòng', async () => {
      const hidden = new Set(['field:sales_assignment']);
      ui.getHiddenElementKeys.mockResolvedValue(hidden);
      customerRepo.createQueryBuilder.mockReturnValue(
        fakeQb({ many: [{ id: 1, name: 'A', phone: null, source: 's', status: 'x', createdAt: new Date(), salesUser: null, marketingUser: null }], count: 1 }),
      );
      membershipRepo.createQueryBuilder.mockReturnValue(fakeQb({ many: [] }));

      await service.listCustomers(1, {}, caller);
      expect(ui.stripHiddenCustomerFields).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), hidden);
    });
  });
});
