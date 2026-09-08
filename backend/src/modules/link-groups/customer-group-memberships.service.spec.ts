import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CustomerGroupMembershipsService } from './customer-group-memberships.service';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { PermissionsService } from '../permissions/permissions.service';

describe('CustomerGroupMembershipsService', () => {
  let service: CustomerGroupMembershipsService;

  // QueryBuilder giả lập cho groupRepo (getMembershipsForCustomer) - mọi
  // method chain đều return chính mockQueryBuilder để hỗ trợ fluent-chain,
  // chỉ .getRawMany() là async thật (trả Promise).
  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  // ⚠️ QueryBuilder giả lập RIÊNG cho customerRepo - dùng bởi
  // assertCustomerAccessible() (select/where/andWhere/getOne) VÀ (mới, xem
  // canManageMembership()) - cả 2 đều gọi customerRepo.createQueryBuilder(),
  // nên mockCustomerQueryBuilder.getOne dùng CHUNG - test nào cần phân biệt
  // 2 lần gọi khác kết quả nhau thì tự dùng .mockResolvedValueOnce() theo
  // đúng THỨ TỰ gọi thật (assertCustomerAccessible TRƯỚC, canManageMembership
  // SAU - xem getMembershipsForCustomer()).
  const mockCustomerQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
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
    createQueryBuilder: jest.fn(() => mockCustomerQueryBuilder),
  };
  const mockPermissionsService = {
    hasPermission: jest.fn(),
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
    mockCustomerQueryBuilder.select.mockReturnThis();
    mockCustomerQueryBuilder.where.mockReturnThis();
    mockCustomerQueryBuilder.andWhere.mockReturnThis();
    mockGroupRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockCustomerRepo.createQueryBuilder.mockReturnValue(mockCustomerQueryBuilder);

    // Mặc định: customer NẰM TRONG phạm vi truy cập (assertCustomerAccessible
    // pass) - test riêng "ngoài phạm vi/không tồn tại" sẽ tự override lại
    // getOne() -> null ở từng case cụ thể.
    mockCustomerQueryBuilder.getOne.mockResolvedValue({ id: 1 });
    // Mặc định: role có permission `customer_group_memberships.set` với
    // scope 'all' (canManageMembership() sẽ luôn pass qua thêm 1 lượt
    // getOne() nữa, đã mock sẵn ở dòng trên) - test riêng cho `canManage`
    // sẽ tự override lại.
    mockPermissionsService.hasPermission.mockResolvedValue({ allowed: true, scope: PermissionScope.ALL });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerGroupMembershipsService,
        { provide: getRepositoryToken(CustomerGroupMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(LinkGroup), useValue: mockGroupRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    service = module.get<CustomerGroupMembershipsService>(CustomerGroupMembershipsService);
  });

  describe('getMembershipsForCustomer', () => {
    it('ném NotFoundException nếu customer KHÔNG TỒN TẠI hoặc NGOÀI PHẠM VI truy cập (assertCustomerAccessible)', async () => {
      // getOne() trả null - dùng chung 1 kịch bản cho cả 2 trường hợp
      // (không tồn tại / có tồn tại nhưng ngoài phạm vi role) vì
      // assertCustomerAccessible() không phân biệt được 2 case này (đúng ý
      // thiết kế: không lộ "khách hàng này có tồn tại nhưng bạn không có
      // quyền xem" - trả 404 đồng nhất).
      mockCustomerQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.getMembershipsForCustomer(999, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(NotFoundException);
      expect(mockGroupRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('trả về { items, canManage } - checklist đầy đủ, group CHƯA có membership row vẫn hiện joined=false (không bị thiếu)', async () => {
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

      const result = await service.getMembershipsForCustomer(1, 1, Role.ADMIN, PermissionScope.ALL);

      expect(mockGroupRepo.createQueryBuilder).toHaveBeenCalledWith('g');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('g.isActive = true');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ groupId: 10, joined: false, joinedAt: null });
      expect(result.items[1]).toMatchObject({ groupId: 11, joined: true });
      expect(result.items[1].joinedAt).toBeInstanceOf(Date);
      // ADMIN -> canManage luôn true qua lối thoát hiểm, KHÔNG cần tra
      // permissionsService (đồng bộ PermissionGuard).
      expect(result.canManage).toBe(true);
      expect(mockPermissionsService.hasPermission).not.toHaveBeenCalled();
    });

    it('trả mảng rỗng nếu không có group nào đang active', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getMembershipsForCustomer(1, 1, Role.ADMIN, PermissionScope.ALL);

      expect(result.items).toEqual([]);
    });

    it('MANAGER: assertCustomerAccessible áp đúng filter theo phòng ban quản lý (andWhere được gọi)', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getMembershipsForCustomer(1, 7, Role.MANAGER, PermissionScope.DEPARTMENT);

      expect(mockCustomerQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('department_id IN'),
        { accessManagerId: 7 },
      );
    });

    it('canManage=false nếu role KHÔNG có permission `customer_group_memberships.set`', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockPermissionsService.hasPermission.mockResolvedValue({ allowed: false, scope: null });

      const result = await service.getMembershipsForCustomer(1, 5, Role.EMPLOYEE, PermissionScope.ALL, 3);

      expect(mockPermissionsService.hasPermission).toHaveBeenCalledWith(
        Role.EMPLOYEE,
        'customer_group_memberships.set',
        3,
      );
      expect(result.canManage).toBe(false);
    });

    it("canManage=false nếu role CÓ permission scope='own' nhưng khách hàng này KHÔNG PHẢI của mình", async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockPermissionsService.hasPermission.mockResolvedValue({ allowed: true, scope: PermissionScope.OWN });
      // Lượt getOne() ĐẦU (assertCustomerAccessible, dùng scope customers.view
      // = ALL truyền vào) pass; lượt SAU (canManageMembership, dùng scope
      // 'own' vừa mock) fail - đúng kịch bản Employee xem được (vd
      // customers.view scope=all) nhưng KHÔNG được tick (set scope=own, không
      // phải khách của mình).
      mockCustomerQueryBuilder.getOne
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      const result = await service.getMembershipsForCustomer(1, 5, Role.EMPLOYEE, PermissionScope.ALL, null);

      expect(result.canManage).toBe(false);
    });

    it("canManage=true nếu role CÓ permission scope='own' VÀ khách hàng này LÀ của mình", async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      mockPermissionsService.hasPermission.mockResolvedValue({ allowed: true, scope: PermissionScope.OWN });
      mockCustomerQueryBuilder.getOne
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 1 });

      const result = await service.getMembershipsForCustomer(1, 5, Role.EMPLOYEE, PermissionScope.OWN, null);

      expect(result.canManage).toBe(true);
    });
  });

  describe('setMembership', () => {
    it('ném NotFoundException nếu customer KHÔNG TỒN TẠI hoặc NGOÀI PHẠM VI truy cập', async () => {
      mockCustomerQueryBuilder.getOne.mockResolvedValue(null);
      mockGroupRepo.findOne.mockResolvedValue({ id: 10 });

      await expect(
        service.setMembership(999, 10, true, 5, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(NotFoundException);
      expect(mockMembershipRepo.save).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu group không tồn tại', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setMembership(1, 999, true, 5, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(NotFoundException);
      expect(mockMembershipRepo.save).not.toHaveBeenCalled();
    });

    it('tạo mới membership (upsert) khi CHƯA có row - set joined=true kèm joinedAt', async () => {
      mockCustomerRepo.findOne.mockResolvedValue({ id: 1 });
      mockGroupRepo.findOne.mockResolvedValue({ id: 10 });
      mockMembershipRepo.findOne.mockResolvedValue(null);
      mockMembershipRepo.create.mockReturnValue({ customerId: 1, groupId: 10 });
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve({ id: 100, ...m }));

      const result = await service.setMembership(1, 10, true, 5, Role.ADMIN, PermissionScope.ALL);

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

      const result = await service.setMembership(1, 10, false, 9, Role.ADMIN, PermissionScope.ALL);

      expect(mockMembershipRepo.create).not.toHaveBeenCalled();
      expect(result.joined).toBe(false);
      expect(result.joinedAt).toBeNull();
      expect(result.updatedBy).toBe(9);
    });

    it('EMPLOYEE ngoài phạm vi (không phải sales/creator/assignment active) bị chặn TRƯỚC khi chạm tới group', async () => {
      mockCustomerQueryBuilder.getOne.mockResolvedValue(null); // ngoài phạm vi -> assertCustomerAccessible fail

      await expect(
        service.setMembership(1, 10, true, 7, Role.EMPLOYEE, PermissionScope.OWN),
      ).rejects.toThrow(NotFoundException);
      expect(mockGroupRepo.findOne).not.toHaveBeenCalled(); // dừng sớm, không đi tiếp
    });
  });
});