import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Setting } from '../../database/entities/setting.entity';

/**
 * ⚠️ Chỉ test `getLogs()` (query filter logic) - phần còn lại (`logAction`,
 * cleanup, settings) là CRUD đơn giản qua repository, chưa cần spec riêng
 * (khớp baseline trước khi sửa - module `audit` trước đây CHƯA có spec).
 *
 * Bối cảnh sửa: tách "Người thực hiện" (lọc chính xác qua `userId`, FE dùng
 * dropdown chọn User) khỏi "Tên khách hàng" (`customerSearch`, chỉ khớp
 * `customer.name` - KHÔNG còn OR với `user.name` như hành vi cũ).
 */
describe('AuditService.getLogs', () => {
  let service: AuditService;

  function makeFakeQb() {
    const andWhereCalls: Array<{ sql: string; params?: any }> = [];
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndMapOne: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn((sql: string, params?: any) => {
        andWhereCalls.push({ sql, params });
        return qb;
      }),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return { qb, andWhereCalls };
  }

  const mockAuditLogRepo = { createQueryBuilder: jest.fn() };
  const mockSettingRepo = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepo },
        { provide: getRepositoryToken(Setting), useValue: mockSettingRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('userId: lọc CHÍNH XÁC theo log.userId (dropdown FE gửi ID, không phải tên)', async () => {
    const { qb, andWhereCalls } = makeFakeQb();
    mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getLogs({ page: 1, limit: 20, userId: 7 });

    const userIdCall = andWhereCalls.find((c) => c.sql.includes('log.userId ='));
    expect(userIdCall).toBeDefined();
    expect(userIdCall?.params).toEqual({ userId: 7 });
    // KHÔNG được có điều kiện nào động tới user.name/customer.name khi chỉ lọc userId.
    expect(andWhereCalls.some((c) => c.sql.includes('.name LIKE'))).toBe(false);
  });

  it('customerSearch: CHỈ khớp customer.name, KHÔNG còn OR với user.name (khác hành vi `search` cũ)', async () => {
    const { qb, andWhereCalls } = makeFakeQb();
    mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getLogs({ page: 1, limit: 20, customerSearch: 'Nguyen Van A' });

    const searchCall = andWhereCalls.find((c) => c.sql.includes('LIKE'));
    expect(searchCall).toBeDefined();
    expect(searchCall?.sql).toBe('customer.name LIKE :customerSearch');
    expect(searchCall?.sql).not.toContain('user.name');
    expect(searchCall?.params).toEqual({ customerSearch: '%Nguyen Van A%' });
  });

  it('kết hợp userId (người thực hiện) + customerSearch (tên khách hàng) cùng lúc -> 2 điều kiện AND độc lập', async () => {
    const { qb, andWhereCalls } = makeFakeQb();
    mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getLogs({ page: 1, limit: 20, userId: 3, customerSearch: 'Tran Thi B' });

    expect(andWhereCalls.some((c) => c.sql.includes('log.userId ='))).toBe(true);
    expect(andWhereCalls.some((c) => c.sql === 'customer.name LIKE :customerSearch')).toBe(true);
  });

  it('không truyền filter nào ngoài page/limit -> không có andWhere nào được gọi', async () => {
    const { qb, andWhereCalls } = makeFakeQb();
    mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getLogs({ page: 1, limit: 20 });

    expect(andWhereCalls).toHaveLength(0);
  });

  it('action + entityType + excludeEntityType + khoảng ngày vẫn hoạt động đúng như cũ (không regress)', async () => {
    const { qb, andWhereCalls } = makeFakeQb();
    mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

    await service.getLogs({
      page: 1,
      limit: 20,
      action: 'CREATE_LINK_GROUP',
      excludeEntityType: 'auth',
      fromDate: '2026-09-01T00:00:00.000Z',
      toDate: '2026-09-21T00:00:00.000Z',
    });

    expect(andWhereCalls.some((c) => c.sql === 'log.action = :action' && c.params.action === 'CREATE_LINK_GROUP')).toBe(true);
    expect(andWhereCalls.some((c) => c.sql === 'log.entityType != :excludeEntityType')).toBe(true);
    expect(andWhereCalls.some((c) => c.sql === 'log.createdAt >= :fromDate')).toBe(true);
    expect(andWhereCalls.some((c) => c.sql === 'log.createdAt < :toDate')).toBe(true);
  });
});