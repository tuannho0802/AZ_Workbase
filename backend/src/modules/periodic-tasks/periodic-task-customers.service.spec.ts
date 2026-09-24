import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PeriodicTaskCustomersService } from './periodic-task-customers.service';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskAuditService } from './periodic-task-audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PeriodicTaskCustomer } from '../../database/entities/periodic-task-customer.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Role } from '../../common/enums/role.enum';

/**
 * Spec CHỈ bao phủ `attachCustomerCountToList()` (mới thêm) - service này
 * trước đó KHÔNG có spec riêng (đã bị xoá ở đợt rà soát checklist trước, xem
 * WORKFLOW_LOG "XOÁ periodic-task-customers.service.spec.ts") nên các
 * method còn lại (`addCustomers`/`removeCustomer`/`attachLinkedCustomers`)
 * vẫn là nợ test cũ, KHÔNG thuộc phạm vi thay đổi lần này.
 */
describe('PeriodicTaskCustomersService - attachCustomerCountToList', () => {
  let service: PeriodicTaskCustomersService;

  const mockLinkRepo = {};

  // Mock chuỗi QueryBuilder trả về `this` ở mọi bước trung gian, chỉ
  // `getRawMany()` là điểm dừng thật - đủ dùng vì test dùng Root Admin
  // (CustomerAccessHelper.applyViewFilter() return sớm, KHÔNG gọi thêm
  // .andWhere()/.leftJoin() nào khác của nhánh department/own).
  const mockQb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };
  const mockCustomerRepo = {
    createQueryBuilder: jest.fn(() => mockQb),
  };
  const mockTasksService = {};
  const mockAuditService = {};
  const mockPermissionsService = {
    hasPermission: jest.fn(),
  };

  const rootAdmin = { id: 1, role: Role.ADMIN, isRootAdmin: true };
  const employeeNoAccess = { id: 2, role: Role.EMPLOYEE, isRootAdmin: false, departmentId: 3, positionId: null };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskCustomersService,
        { provide: getRepositoryToken(PeriodicTaskCustomer), useValue: mockLinkRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: PeriodicTasksService, useValue: mockTasksService },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: PeriodicTaskAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PeriodicTaskCustomersService>(PeriodicTaskCustomersService);
  });

  it('trả [] và KHÔNG query khi danh sách Task rỗng', async () => {
    expect(await service.attachCustomerCountToList([], rootAdmin)).toEqual([]);
    expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('XOÁ HẲN field customerCount (không phải 0) khi người xem KHÔNG có quyền customers.view', async () => {
    mockPermissionsService.hasPermission.mockResolvedValue({ allowed: false, scope: null });
    const tasks = [{ id: 10 }, { id: 11 }];

    const result = await service.attachCustomerCountToList(tasks, employeeNoAccess);

    expect(result).toEqual(tasks);
    expect('customerCount' in result[0]).toBe(false);
    expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('đính đúng customerCount cho từng Task (1 query gom nhóm), Task không có Khách hàng nào -> 0', async () => {
    mockQb.getRawMany.mockResolvedValue([
      { taskId: '10', count: '3' },
      { taskId: '12', count: '1' },
    ]);
    const tasks = [{ id: 10 }, { id: 11 }, { id: 12 }];

    const result = await service.attachCustomerCountToList(tasks, rootAdmin);

    expect(mockCustomerRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(mockQb.where).toHaveBeenCalledWith('ptc.task_id IN (:...taskIds)', { taskIds: [10, 11, 12] });
    expect(result).toEqual([
      { id: 10, customerCount: 3 },
      { id: 11, customerCount: 0 },
      { id: 12, customerCount: 1 },
    ]);
  });
});
