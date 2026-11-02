import { NotFoundException } from '@nestjs/common';
import { CustomersWithdrawalsService } from './customers-withdrawals.service';
import { CustomerNotFoundException } from './exceptions/customer.exceptions';
import { CustomerAccessHelper } from './helpers/customer-access.helper';

describe('CustomersWithdrawalsService', () => {
  let service: CustomersWithdrawalsService;
  let wRepo: any;
  let cRepo: any;
  let audit: { logActionAsync: jest.Mock };
  let customerQb: any;
  let applySpy: jest.SpyInstance;

  const makeQb = (result: any) => {
    const qb: any = {};
    for (const m of ['select', 'where', 'andWhere', 'leftJoin', 'addSelect', 'orderBy', 'addOrderBy', 'limit']) qb[m] = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn().mockResolvedValue(result);
    qb.getMany = jest.fn().mockResolvedValue(result);
    return qb;
  };

  beforeEach(() => {
    customerQb = makeQb({ id: 5 });
    cRepo = { createQueryBuilder: jest.fn().mockReturnValue(customerQb) };
    wRepo = {
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => ({ id: 9, ...x })),
      findOne: jest.fn(),
      remove: jest.fn(async (x) => x),
      createQueryBuilder: jest.fn(),
    };
    audit = { logActionAsync: jest.fn() };
    applySpy = jest.spyOn(CustomerAccessHelper, 'applyViewFilter').mockImplementation(() => undefined as any);
    service = new CustomersWithdrawalsService(wRepo, cRepo, audit as any);
  });
  afterEach(() => applySpy.mockRestore());

  describe('create', () => {
    it('kiểm tra phạm vi, lưu phiếu (ngày cắt YYYY-MM-DD, rỗng -> null) và ghi audit CREATE_WITHDRAWAL', async () => {
      wRepo.createQueryBuilder.mockReturnValue(makeQb({ id: 9 }));
      await service.create(5, { amount: 50, withdrawalDate: '2026-11-02T17:00:00.000Z', broker: ' ', note: ' ghi chú ' }, 7, 'employee', 'own');
      expect(applySpy).toHaveBeenCalledWith(customerQb, 7, 'employee', 'own');
      expect(wRepo.create).toHaveBeenCalledWith({ customerId: 5, amount: 50, withdrawalDate: '2026-11-02', broker: null, note: 'ghi chú', createdById: 7 });
      expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'CREATE_WITHDRAWAL', 'withdrawal', 9, null, { amount: 50, withdrawalDate: '2026-11-02', broker: null, note: 'ghi chú' });
    });

    it('khách ngoài phạm vi -> CustomerNotFoundException, KHÔNG lưu, KHÔNG audit', async () => {
      customerQb.getOne.mockResolvedValue(null);
      await expect(service.create(5, { amount: 1, withdrawalDate: '2026-11-02' }, 7, 'employee', 'own')).rejects.toBeInstanceOf(CustomerNotFoundException);
      expect(wRepo.save).not.toHaveBeenCalled();
      expect(audit.logActionAsync).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('giới hạn 50, sắp xếp mới nhất trước, đã qua cổng phạm vi', async () => {
      const qb = makeQb([{ id: 2 }]);
      wRepo.createQueryBuilder.mockReturnValue(qb);
      await expect(service.list(5, 7, 'manager', 'department')).resolves.toEqual([{ id: 2 }]);
      expect(applySpy).toHaveBeenCalled();
      expect(qb.limit).toHaveBeenCalledWith(50);
      expect(qb.orderBy).toHaveBeenCalledWith('withdrawal.withdrawalDate', 'DESC');
    });
    it('ngoài phạm vi -> 404, không đọc phiếu', async () => {
      customerQb.getOne.mockResolvedValue(null);
      await expect(service.list(5, 7, 'manager', 'department')).rejects.toBeInstanceOf(CustomerNotFoundException);
      expect(wRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('updateNote', () => {
    it('không có phiếu -> NotFoundException', async () => {
      wRepo.findOne.mockResolvedValue(null);
      await expect(service.updateNote(9, { note: 'x' }, 7, 'admin', 'all')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('phiếu của khách ngoài phạm vi -> 404, không lưu', async () => {
      wRepo.findOne.mockResolvedValue({ id: 9, customerId: 5, amount: 1, note: 'a' });
      customerQb.getOne.mockResolvedValue(null);
      await expect(service.updateNote(9, { note: 'x' }, 7, 'employee', 'own')).rejects.toBeInstanceOf(CustomerNotFoundException);
      expect(wRepo.save).not.toHaveBeenCalled();
    });
    it('lưu note mới, chuỗi rỗng -> null, audit có before/after', async () => {
      wRepo.findOne.mockResolvedValue({ id: 9, customerId: 5, amount: 10, withdrawalDate: '2026-11-01', broker: 'XM', note: 'cũ' });
      wRepo.createQueryBuilder.mockReturnValue(makeQb({ id: 9 }));
      await service.updateNote(9, { note: '  ' }, 7, 'admin', 'all');
      expect(wRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 9, note: null }));
      expect(audit.logActionAsync).toHaveBeenCalledWith(
        7, 'UPDATE_WITHDRAWAL_NOTE', 'withdrawal', 9,
        { amount: 10, withdrawalDate: '2026-11-01', broker: 'XM', note: 'cũ' },
        { amount: 10, withdrawalDate: '2026-11-01', broker: 'XM', note: null },
      );
    });
  });

  describe('remove', () => {
    it('không có phiếu -> NotFoundException', async () => {
      wRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(9, 7, 'admin', 'all')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('ngoài phạm vi -> 404, không xoá', async () => {
      wRepo.findOne.mockResolvedValue({ id: 9, customerId: 5 });
      customerQb.getOne.mockResolvedValue(null);
      await expect(service.remove(9, 7, 'manager', 'department')).rejects.toBeInstanceOf(CustomerNotFoundException);
      expect(wRepo.remove).not.toHaveBeenCalled();
    });
    it('xoá và lưu snapshot vào audit DELETE_WITHDRAWAL', async () => {
      wRepo.findOne.mockResolvedValue({ id: 9, customerId: 5, amount: 10, withdrawalDate: '2026-11-01', broker: null, note: 'n' });
      await service.remove(9, 7, 'admin', 'all');
      expect(wRepo.remove).toHaveBeenCalled();
      expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'DELETE_WITHDRAWAL', 'withdrawal', 9, { amount: 10, withdrawalDate: '2026-11-01', broker: null, note: 'n' }, null);
    });
  });
});
