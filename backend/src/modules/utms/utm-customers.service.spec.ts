import { ForbiddenException } from '@nestjs/common';
import { UtmCustomersService } from './utm-customers.service';

/** Khoá hợp đồng an toàn dữ liệu: quản lý UTM KHÔNG mở rộng quyền xem KH (luôn qua applyViewFilter). */
describe('UtmCustomersService', () => {
  const caller: any = { id: 10, role: 'employee' };
  const qb: any = {};
  ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'leftJoinAndSelect', 'withDeleted', 'orderBy', 'addOrderBy', 'skip', 'take', 'offset', 'limit'].forEach(
    (m) => (qb[m] = jest.fn(() => qb)),
  );
  const repo: any = { createQueryBuilder: jest.fn(() => qb) };
  const managers: any = { getManagers: jest.fn() };
  const ui: any = { getHiddenElementKeys: jest.fn().mockResolvedValue(new Set()), stripHiddenCustomerFields: jest.fn((r) => r) };
  const permissions: any = { hasPermission: jest.fn().mockResolvedValue({ allowed: true }) };
  const svc = new UtmCustomersService(repo, managers, ui, permissions);
  const calls = () => qb.where.mock.calls.length + qb.andWhere.mock.calls.length;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.createQueryBuilder.mockImplementation(() => qb);
    ui.getHiddenElementKeys.mockResolvedValue(new Set());
    ui.stripHiddenCustomerFields.mockImplementation((r: unknown) => r);
    permissions.hasPermission.mockResolvedValue({ allowed: true });
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
    expect(qb.offset).toHaveBeenCalledWith(10);
  });

  describe('Thùng rác (trashed)', () => {
    beforeEach(() => {
      managers.getManagers.mockResolvedValue({});
      qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    });

    it('mặc định exclude: lọc deletedAt IS NULL, KHÔNG withDeleted, KHÔNG tra quyền Thùng rác', async () => {
      await svc.listCustomers(3, {}, caller, 'own');
      expect(qb.where).toHaveBeenCalledWith('customer.deletedAt IS NULL');
      expect(qb.withDeleted).not.toHaveBeenCalled();
      expect(permissions.hasPermission).not.toHaveBeenCalled();
    });

    it('only: withDeleted + deletedAt IS NOT NULL, vẫn áp scope xem', async () => {
      await svc.listCustomers(3, { trashed: 'only' }, caller, 'own');
      expect(permissions.hasPermission).toHaveBeenCalledWith('employee', 'customers.trash_manage', undefined, undefined);
      expect(qb.where).toHaveBeenCalledWith('customer.deletedAt IS NOT NULL');
      expect(qb.withDeleted).toHaveBeenCalled();
      expect(calls()).toBeGreaterThan(2); // applyViewFilter vẫn thêm điều kiện
    });

    it('include: withDeleted, không lọc deletedAt', async () => {
      await svc.listCustomers(3, { trashed: 'include' }, caller, 'own');
      expect(qb.where).toHaveBeenCalledWith('1 = 1');
      expect(qb.withDeleted).toHaveBeenCalled();
    });

    it('thiếu quyền customers.trash_manage -> 403, KHÔNG truy vấn khách', async () => {
      permissions.hasPermission.mockResolvedValue({ allowed: false });
      await expect(svc.listCustomers(3, { trashed: 'include' }, caller, 'own')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('Root Admin không cần tra bảng quyền', async () => {
      await svc.listCustomers(3, { trashed: 'only' }, { id: 1, role: 'admin', isRootAdmin: true } as any, 'all');
      expect(permissions.hasPermission).not.toHaveBeenCalled();
    });

    it('trả deletedAt của từng dòng', async () => {
      const d = new Date('2026-09-01T00:00:00Z');
      qb.getManyAndCount = jest.fn().mockResolvedValue([[{ id: 1, name: 'A', createdAt: d, deletedAt: d }], 1]);
      const res = await svc.listCustomers(3, { trashed: 'include' }, caller, 'own');
      expect((res.data[0] as any).deletedAt).toBe(d);
    });
  });

  describe('listForUtms (Mini Table tab Thống kê)', () => {
    const filter = { from: '2026-09-01', to: '2026-09-30' };
    beforeEach(() => {
      qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    });

    it('scope null (không có customers.view) -> trang rỗng, KHÔNG truy vấn', async () => {
      const res = await svc.listForUtms([1], filter, caller, null);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(res).toEqual({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    });

    it('tập UTM rỗng -> trang rỗng, KHÔNG truy vấn (không rơi về "tất cả khách")', async () => {
      await svc.listForUtms([], filter, caller, 'all');
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lọc theo tập UTM + khoảng Ngày nhập + loại Thùng rác + scope xem; join UTM để hiện tag', async () => {
      await svc.listForUtms([1, 2], { ...filter, status: 'closed', search: ' An ', page: 3, limit: 20 }, caller, 'own');
      expect(qb.where).toHaveBeenCalledWith('customer.deletedAt IS NULL');
      expect(qb.withDeleted).not.toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledWith('customer.utmId IN (:...utmIds)', { utmIds: [1, 2] });
      expect(qb.andWhere).toHaveBeenCalledWith('customer.inputDate >= :from AND customer.inputDate <= :to', filter);
      expect(qb.andWhere).toHaveBeenCalledWith('customer.status = :status', { status: 'closed' });
      expect(qb.andWhere).toHaveBeenCalledWith('(customer.name LIKE :kw OR customer.phone LIKE :kw)', { kw: '%An%' });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('customer.utm', 'utm');
      expect(qb.offset).toHaveBeenCalledWith(40);
      expect(calls()).toBeGreaterThan(5); // applyViewFilter (own) thêm điều kiện
    });

    it('Admin (all): không thêm điều kiện lọc phân quyền khách', async () => {
      await svc.listForUtms([1], filter, { id: 1, role: 'admin' } as any, 'all');
      expect(calls()).toBe(3); // deletedAt + utmId + ngày
    });

    it('map dòng kèm UTM (tag) và strip field ẩn', async () => {
      qb.getManyAndCount = jest.fn().mockResolvedValue([
        [{ id: 5, name: 'A', phone: '090', status: 'pending', utmId: 2, utm: { id: 2, name: 'TT', color: '#222', isActive: 0 }, createdAt: new Date() }],
        1,
      ]);
      const res = await svc.listForUtms([2], filter, caller, 'own');
      expect(res.data[0]).toMatchObject({ id: 5, utmId: 2, utm: { id: 2, name: 'TT', isActive: false } });
      expect(ui.stripHiddenCustomerFields).toHaveBeenCalled();
      expect(res.totalPages).toBe(1);
    });
  });
});
