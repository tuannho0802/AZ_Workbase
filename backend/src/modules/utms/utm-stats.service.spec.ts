import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UtmStatsService } from './utm-stats.service';

/** Khoá hợp đồng an toàn dữ liệu của tab Thống kê: UTM theo scope utms.view, khách LUÔN qua applyViewFilter. */
describe('UtmStatsService', () => {
  const caller: any = { id: 10, role: 'employee' };
  const qb: any = {};
  ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy'].forEach((m) => (qb[m] = jest.fn(() => qb)));
  const customerRepo: any = { createQueryBuilder: jest.fn(() => qb) };
  const statusRepo: any = {
    find: jest.fn().mockResolvedValue([
      { code: 'pending', name: 'Chờ', color: '#faad14' },
      { code: 'closed', name: 'Chốt', color: '#52c41a' },
    ]),
  };
  const scopes: Record<string, string | null> = {};
  const briefs = [
    { id: 1, name: 'FB', color: '#111', isActive: true, primaryManager: { id: 10, name: 'Chính A' }, secondaryManagers: [{ id: 20, name: 'Phụ B' }] },
    { id: 2, name: 'TT', color: '#222', isActive: false, primaryManager: { id: 11, name: 'Chính C' }, secondaryManagers: [] },
    { id: 3, name: 'GG', color: '#333', isActive: true, primaryManager: { id: 10, name: 'Chính A' }, secondaryManagers: [{ id: 21, name: 'Phụ D' }] },
  ];
  const utmsService: any = {
    scopeOf: jest.fn(async (_u: unknown, key: string) => scopes[key] ?? null),
    scopedUtmBriefs: jest.fn(async () => briefs),
  };
  const customersService: any = { listForUtms: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 }) };
  const svc = new UtmStatsService(customerRepo, statusRepo, utmsService, customersService);
  const whereCalls = () => qb.where.mock.calls.length + qb.andWhere.mock.calls.length;
  const q = { from: '2026-09-28', to: '2026-09-30' };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(scopes)) delete scopes[k];
    scopes['utms.view'] = 'own';
    scopes['customers.view'] = 'own';
    utmsService.scopedUtmBriefs.mockResolvedValue(briefs);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
  });

  it('không có utms.view -> 403, KHÔNG truy vấn khách', async () => {
    scopes['utms.view'] = null;
    await expect(svc.getStats(caller, q)).rejects.toBeInstanceOf(ForbiddenException);
    expect(customerRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('không có customers.view -> số liệu 0, KHÔNG truy vấn khách (applyViewFilter không fail-closed)', async () => {
    scopes['customers.view'] = null;
    const res = await svc.getStats(caller, q);
    expect(customerRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(res.customerScope).toBeNull();
    expect(res.totals.total).toBe(0);
    expect(res.series).toHaveLength(3);
  });

  it('không có UTM nào trong phạm vi -> không truy vấn khách', async () => {
    utmsService.scopedUtmBriefs.mockResolvedValue([]);
    const res = await svc.getStats(caller, q);
    expect(customerRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(res.utmCount).toBe(0);
  });

  it('lọc khách theo đúng danh sách UTM trong phạm vi + khoảng ngày + scope customers.view (own thêm điều kiện)', async () => {
    await svc.getStats(caller, q);
    expect(qb.andWhere).toHaveBeenCalledWith('customer.utmId IN (:...utmIds)', { utmIds: [1, 2, 3] });
    expect(qb.andWhere).toHaveBeenCalledWith('customer.inputDate >= :from AND customer.inputDate <= :to', q);
    expect(whereCalls()).toBeGreaterThan(3);
  });

  it('Admin: không thêm điều kiện lọc phân quyền khách (chỉ deletedAt + utm + ngày)', async () => {
    scopes['utms.view'] = 'all';
    scopes['customers.view'] = 'all';
    await svc.getStats({ id: 1, role: 'admin' } as any, q);
    expect(whereCalls()).toBe(3);
  });

  it('utmId ngoài phạm vi utms.view -> 403', async () => {
    await expect(svc.getStats(caller, { ...q, utmId: 99 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(customerRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('utmId trong phạm vi -> chỉ truy vấn UTM đó', async () => {
    const res = await svc.getStats(caller, { ...q, utmId: 2 });
    expect(qb.andWhere).toHaveBeenCalledWith('customer.utmId IN (:...utmIds)', { utmIds: [2] });
    expect(res.utmCount).toBe(1);
    expect(res.utms.map((u) => u.id)).toEqual([1, 2, 3]); // dropdown lọc vẫn đủ UTM trong phạm vi
  });

  it('gom số liệu: status mồ côi hiện bằng mã + màu trung tính, tổng khớp', async () => {
    qb.getRawMany = jest.fn().mockResolvedValue([
      { date: '2026-09-28', utmId: '1', status: 'pending', cnt: '3' },
      { date: '2026-09-30', utmId: '2', status: 'weird', cnt: '1' },
    ]);
    const res = await svc.getStats(caller, q);
    expect(res.totals.total).toBe(4);
    expect(res.statuses.map((s) => s.code)).toEqual(['pending', 'closed', 'weird']);
    expect(res.statuses[2]).toMatchObject({ name: 'weird', color: '#8c8c8c' });
    expect(res.series.map((p) => p.total)).toEqual([3, 0, 1]);
  });

  it('khoảng ngày sai -> 400 (đảo ngược / quá dài / không tồn tại)', async () => {
    await expect(svc.getStats(caller, { from: '2026-09-30', to: '2026-09-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getStats(caller, { from: '2024-01-01', to: '2026-09-30' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.getStats(caller, { from: '2026-02-30', to: '2026-03-05' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kỳ > 92 ngày -> gom theo tháng', async () => {
    const res = await svc.getStats(caller, { from: '2026-06-01', to: '2026-09-30' });
    expect(res.range.granularity).toBe('month');
    expect(res.series.map((p) => p.date)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  describe('bộ lọc nhanh (UTM / Quản lý chính / Quản lý phụ)', () => {
    const utmIdsOf = () => (qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'customer.utmId IN (:...utmIds)')?.[1] as any)?.utmIds;

    it('utmIds: chỉ giữ UTM được chọn, ID ngoài phạm vi bị bỏ qua (không 403)', async () => {
      const res = await svc.getStats(caller, { ...q, utmIds: [1, 3, 999] });
      expect(utmIdsOf()).toEqual([1, 3]);
      expect(res.utmCount).toBe(2);
    });

    it('utmIds rỗng = không lọc', async () => {
      await svc.getStats(caller, { ...q, utmIds: [] });
      expect(utmIdsOf()).toEqual([1, 2, 3]);
    });

    it('primaryManagerId: chỉ UTM có Quản lý chính là user đó', async () => {
      await svc.getStats(caller, { ...q, primaryManagerId: 10 });
      expect(utmIdsOf()).toEqual([1, 3]);
    });

    it('secondaryManagerId: chỉ UTM có user đó là Quản lý phụ', async () => {
      await svc.getStats(caller, { ...q, secondaryManagerId: 21 });
      expect(utmIdsOf()).toEqual([3]);
    });

    it('kết hợp chính + phụ + utmIds = GIAO các điều kiện', async () => {
      await svc.getStats(caller, { ...q, primaryManagerId: 10, secondaryManagerId: 20, utmIds: [1, 2] });
      expect(utmIdsOf()).toEqual([1]);
    });

    it('lọc ra tập rỗng -> KHÔNG truy vấn khách, số liệu 0 (không rơi về "tất cả")', async () => {
      const res = await svc.getStats(caller, { ...q, primaryManagerId: 11, secondaryManagerId: 20 });
      expect(customerRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(res.utmCount).toBe(0);
      expect(res.totals.total).toBe(0);
      expect(res.utms.map((u) => u.id)).toEqual([1, 2, 3]); // dropdown không co lại
    });
  });

  describe('listCustomers (Mini Table)', () => {
    it('không có utms.view -> 403, KHÔNG gọi truy vấn khách', async () => {
      scopes['utms.view'] = null;
      await expect(svc.listCustomers(caller, q)).rejects.toBeInstanceOf(ForbiddenException);
      expect(customersService.listForUtms).not.toHaveBeenCalled();
    });

    it('truyền đúng tập UTM đã lọc + khoảng ngày + status/search/phân trang + scope customers.view', async () => {
      await svc.listCustomers(caller, { ...q, primaryManagerId: 10, status: 'closed', search: 'An', page: 2, limit: 20 });
      expect(customersService.listForUtms).toHaveBeenCalledWith(
        [1, 3],
        { from: q.from, to: q.to, status: 'closed', search: 'An', page: 2, limit: 20 },
        caller,
        'own',
      );
    });

    it('không có customers.view -> vẫn gọi nhưng scope null (service tự trả trang rỗng)', async () => {
      scopes['customers.view'] = null;
      await svc.listCustomers(caller, q);
      expect(customersService.listForUtms.mock.calls[0][3]).toBeNull();
    });

    it('khoảng ngày sai -> 400', async () => {
      await expect(svc.listCustomers(caller, { from: '2026-09-30', to: '2026-09-01' })).rejects.toBeInstanceOf(BadRequestException);
      expect(customersService.listForUtms).not.toHaveBeenCalled();
    });
  });
});
