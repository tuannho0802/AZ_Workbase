import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CustomerGroupMembershipsService } from './customer-group-memberships.service';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { Customer } from '../../database/entities/customer.entity';

describe('CustomerGroupMembershipsService', () => {
  let service: CustomerGroupMembershipsService;

  // QueryBuilder giả lập - mọi method chain (.innerJoin/.leftJoin/.where/
  // .select/.orderBy/.addOrderBy) đều return chính mockQueryBuilder để hỗ
  // trợ fluent-chain, chỉ .getRawMany() là async thật (trả Promise).
  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockMembershipRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockGroupRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };
  const mockCustomerRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // jest.clearAllMocks() xoá luôn implementation của .mockReturnThis() ở
    // các method chain -> phải gán lại SAU khi clear, nếu không mock sẽ trả
    // về undefined và làm gãy toàn bộ chuỗi .innerJoin().leftJoin()... ở
    // các test sau test đầu tiên.
    mockQueryBuilder.innerJoin.mockReturnThis();
    mockQueryBuilder.leftJoin.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.addOrderBy.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerGroupMembershipsService,
        { provide: getRepositoryToken(CustomerGroupMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(LinkGroup), useValue: mockGroupRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
      ],
    }).compile();

    service = module.get<CustomerGroupMembershipsService>(CustomerGroupMembershipsService);
  });

  describe('getMembershipsForCustomer', () => {
    it('ném NotFoundException nếu customer không tồn tại', async () => {
      mockCustomerRepo.findOne.mockResolvedValue(null);

      await expect(service.getMembershipsForCustomer(999)).rejects.toThrow(NotFoundException);
      expect(mockGroupRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('trả về checklist đầy đủ, group CHƯA có membership row vẫn hiện joined=false (không bị thiếu)', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      // Raw row từ MySQL: boolean trả về dạng 0/1 (kể cả khi COALESCE ra false
      // vì customer chưa từng có row membership với group này).
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          categoryId: '1', categoryName: 'Zalo', categoryColor: '#0068FF',
          groupId: '10', groupName: 'Nhóm Sales HN', groupUrl: 'https://zalo.me/g/abc',
          joined: 0, joinedAt: null,
        },
        {
          categoryId: '1', categoryName: 'Zalo', categoryColor: '#0068FF',
          groupId: '11', groupName: 'Nhóm CSKH', groupUrl: 'https://zalo.me/g/xyz',
          joined: 1, joinedAt: '2026-08-20 10:00:00',
        },
      ]);

      const result = await service.getMembershipsForCustomer(1);

      expect(mockGroupRepo.createQueryBuilder).toHaveBeenCalledWith('g');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('g.isActive = true');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ groupId: 10, joined: false, joinedAt: null });
      expect(result[1]).toMatchObject({ groupId: 11, joined: true });
      expect(result[1].joinedAt).toBeInstanceOf(Date);
    });

    it('trả mảng rỗng nếu không có group nào đang active', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getMembershipsForCustomer(1);

      expect(result).toEqual([]);
    });
  });

  describe('setMembership', () => {
    it('ném NotFoundException nếu customer không tồn tại', async () => {
      mockCustomerRepo.findOne.mockResolvedValue(null);
      mockGroupRepo.findOne.mockResolvedValue({ id: 10 });

      await expect(service.setMembership(999, 10, true, 5)).rejects.toThrow(NotFoundException);
      expect(mockMembershipRepo.save).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu group không tồn tại', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.setMembership(1, 999, true, 5)).rejects.toThrow(NotFoundException);
      expect(mockMembershipRepo.save).not.toHaveBeenCalled();
    });

    it('tạo mới membership (upsert) khi CHƯA có row - set joined=true kèm joinedAt', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockGroupRepo.findOne.mockResolvedValue({ id: 10 });
      mockMembershipRepo.findOne.mockResolvedValue(null);
      mockMembershipRepo.create.mockReturnValue({ customerId: 1, groupId: 10 });
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve({ id: 100, ...m }));

      const result = await service.setMembership(1, 10, true, 5);

      expect(mockMembershipRepo.create).toHaveBeenCalledWith({ customerId: 1, groupId: 10 });
      expect(result.joined).toBe(true);
      expect(result.joinedAt).toBeInstanceOf(Date);
      expect(result.updatedBy).toBe(5);
    });

    it('cập nhật (không tạo mới) khi ĐÃ có row - set joined=false thì joinedAt phải là null', async () => {
      const existing = { id: 100, customerId: 1, groupId: 10, joined: true, joinedAt: new Date(), updatedBy: 2 };
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockGroupRepo.findOne.mockResolvedValue({ id: 10 });
      mockMembershipRepo.findOne.mockResolvedValue(existing);
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));

      const result = await service.setMembership(1, 10, false, 9);

      expect(mockMembershipRepo.create).not.toHaveBeenCalled();
      expect(result.joined).toBe(false);
      expect(result.joinedAt).toBeNull();
      expect(result.updatedBy).toBe(9);
    });
  });
});
