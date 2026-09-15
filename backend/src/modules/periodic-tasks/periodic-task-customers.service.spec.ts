import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PeriodicTaskCustomersService } from './periodic-task-customers.service';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PeriodicTaskCustomer } from '../../database/entities/periodic-task-customer.entity';
import { Customer } from '../../database/entities/customer.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';

function makeFakeQueryBuilder(overrides: { getOne?: any; getMany?: any } = {}) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(overrides.getOne ?? null),
    getMany: jest.fn().mockResolvedValue(overrides.getMany ?? []),
  };
  return qb;
}

describe('PeriodicTaskCustomersService', () => {
  let service: PeriodicTaskCustomersService;

  const mockLinkRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockCustomerRepo = {
    createQueryBuilder: jest.fn(),
  };
  const mockTasksService = {
    findOne: jest.fn(),
    assertEditableWhenLocked: jest.fn(),
  };
  const mockPermissionsService = {
    hasPermission: jest.fn(),
  };

  const taskId = 10;
  const employeeUser = { id: 1, role: Role.EMPLOYEE, isRootAdmin: false, departmentId: 2, positionId: null };
  const rootAdminUser = { id: 99, role: Role.ADMIN, isRootAdmin: true, departmentId: null, positionId: null };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTasksService.findOne.mockResolvedValue({ id: taskId });
    mockTasksService.assertEditableWhenLocked.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskCustomersService,
        { provide: getRepositoryToken(PeriodicTaskCustomer), useValue: mockLinkRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: PeriodicTasksService, useValue: mockTasksService },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    service = module.get<PeriodicTaskCustomersService>(PeriodicTaskCustomersService);
  });

  describe('addCustomers', () => {
    it('ném ForbiddenException nếu thiếu periodic_tasks.link_customer (spec bắt buộc PLAN mục 6)', async () => {
      mockPermissionsService.hasPermission.mockResolvedValueOnce({ allowed: false, scope: null }); // link_customer

      await expect(
        service.addCustomers(taskId, { customerIds: [1] }, employeeUser, 'own'),
      ).rejects.toThrow(ForbiddenException);

      // Đã gọi "1 cổng gác" tasksService.findOne() TRƯỚC khi kiểm tra link_customer.
      expect(mockTasksService.findOne).toHaveBeenCalledWith(taskId, employeeUser.id, employeeUser.role, 'own');
      expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('Root Admin bỏ qua mọi kiểm tra permission (link_customer + customers.view)', async () => {
      const qb = makeFakeQueryBuilder({ getOne: { id: 1 } });
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);
      mockLinkRepo.find.mockResolvedValue([]);
      mockLinkRepo.save.mockResolvedValue([]);
      // getLinkedCustomers() gọi lại createQueryBuilder lần 2 -> trả getMany rỗng.
      const qbList = makeFakeQueryBuilder({ getMany: [] });
      mockCustomerRepo.createQueryBuilder.mockReturnValueOnce(qb).mockReturnValueOnce(qbList);

      await service.addCustomers(taskId, { customerIds: [1] }, rootAdminUser, 'all');

      // Root Admin -> KHÔNG gọi permissionsService.hasPermission lần nào.
      expect(mockPermissionsService.hasPermission).not.toHaveBeenCalled();
    });

    it('ném ForbiddenException nếu có link_customer nhưng KHÔNG có customers.view', async () => {
      mockPermissionsService.hasPermission
        .mockResolvedValueOnce({ allowed: true, scope: null }) // link_customer
        .mockResolvedValueOnce({ allowed: false, scope: null }); // customers.view

      await expect(
        service.addCustomers(taskId, { customerIds: [1] }, employeeUser, 'own'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu customer ngoài phạm vi quyền xem (scope customers.view) - spec bắt buộc PLAN mục 6', async () => {
      mockPermissionsService.hasPermission
        .mockResolvedValueOnce({ allowed: true, scope: null }) // link_customer
        .mockResolvedValueOnce({ allowed: true, scope: PermissionScope.OWN }); // customers.view scope=own

      const qb = makeFakeQueryBuilder({ getOne: null }); // customer không nằm trong applyViewFilter
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.addCustomers(taskId, { customerIds: [5] }, employeeUser, 'own'),
      ).rejects.toThrow(BadRequestException);
    });

    it('gắn thành công + bỏ qua customer đã gắn trước đó (idempotent)', async () => {
      mockPermissionsService.hasPermission
        .mockResolvedValueOnce({ allowed: true, scope: null }) // link_customer
        .mockResolvedValueOnce({ allowed: true, scope: PermissionScope.ALL }) // customers.view (validate loop)
        .mockResolvedValueOnce({ allowed: true, scope: PermissionScope.ALL }); // customers.view (getLinkedCustomers)

      const qbValidate1 = makeFakeQueryBuilder({ getOne: { id: 1 } });
      const qbValidate2 = makeFakeQueryBuilder({ getOne: { id: 2 } });
      const qbList = makeFakeQueryBuilder({ getMany: [{ id: 1 }, { id: 2 }] });
      mockCustomerRepo.createQueryBuilder
        .mockReturnValueOnce(qbValidate1)
        .mockReturnValueOnce(qbValidate2)
        .mockReturnValueOnce(qbList);

      // Customer id=1 đã có link sẵn -> KHÔNG insert lại, chỉ insert id=2.
      mockLinkRepo.find.mockResolvedValue([{ customerId: 1 }]);
      mockLinkRepo.save.mockResolvedValue([]);

      const result = await service.addCustomers(taskId, { customerIds: [1, 2] }, employeeUser, 'all');

      expect(mockLinkRepo.create).toHaveBeenCalledTimes(1);
      expect(mockLinkRepo.create).toHaveBeenCalledWith({ taskId, customerId: 2, linkedById: employeeUser.id });
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('removeCustomer', () => {
    it('ném ForbiddenException nếu thiếu periodic_tasks.link_customer', async () => {
      mockPermissionsService.hasPermission.mockResolvedValueOnce({ allowed: false, scope: null });

      await expect(service.removeCustomer(taskId, 1, employeeUser, 'own')).rejects.toThrow(ForbiddenException);
      expect(mockLinkRepo.findOne).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu liên kết không tồn tại', async () => {
      mockPermissionsService.hasPermission.mockResolvedValueOnce({ allowed: true, scope: null });
      mockLinkRepo.findOne.mockResolvedValue(null);

      await expect(service.removeCustomer(taskId, 1, employeeUser, 'own')).rejects.toThrow(NotFoundException);
    });

    it('gỡ liên kết thành công khi tồn tại (Root Admin, không cần hasPermission)', async () => {
      mockLinkRepo.findOne.mockResolvedValue({ id: 1, taskId, customerId: 1 });
      mockLinkRepo.remove.mockResolvedValue(undefined);

      const result = await service.removeCustomer(taskId, 1, rootAdminUser, 'all');

      expect(mockPermissionsService.hasPermission).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('attachLinkedCustomers', () => {
    it('XOÁ HẲN key linkedCustomers nếu người xem không có customers.view (không trả mảng rỗng)', async () => {
      mockPermissionsService.hasPermission.mockResolvedValueOnce({ allowed: false, scope: null });

      const task = { id: taskId, title: 'Task A' };
      const result = await service.attachLinkedCustomers(task, employeeUser);

      expect(result).toEqual({ id: taskId, title: 'Task A' });
      expect('linkedCustomers' in result).toBe(false);
      expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('trả về mảng Customer đã lọc lại đúng phạm vi customers.view của người đang xem', async () => {
      mockPermissionsService.hasPermission.mockResolvedValueOnce({ allowed: true, scope: PermissionScope.OWN });
      const qb = makeFakeQueryBuilder({ getMany: [{ id: 3 }] });
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      const task = { id: taskId, title: 'Task A' };
      const result: any = await service.attachLinkedCustomers(task, employeeUser);

      expect(result.linkedCustomers).toEqual([{ id: 3 }]);
      expect(qb.andWhere).toHaveBeenCalled(); // CustomerAccessHelper.applyViewFilter đã áp dụng
    });
  });
});