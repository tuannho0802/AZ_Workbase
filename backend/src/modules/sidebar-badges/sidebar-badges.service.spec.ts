import { SidebarBadgesService, INVALID_DATA_CACHE_TTL_MS } from './sidebar-badges.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';

describe('SidebarBadgesService', () => {
  let perms: { hasPermission: jest.Mock };
  let customers: { countDuplicatePhoneRecords: jest.Mock; countTrash: jest.Mock };
  let users: { countPendingApprovals: jest.Mock };
  let leave: { countPending: jest.Mock; countMyPending: jest.Mock };
  let tasks: { countAssignedByStatusCodes: jest.Mock };
  let service: SidebarBadgesService;

  const grant = (map: Record<string, PermissionScope | null>) =>
    perms.hasPermission.mockImplementation(async (_role: string, key: string) =>
      key in map ? { allowed: true, scope: map[key] } : { allowed: false, scope: null },
    );

  beforeEach(() => {
    perms = { hasPermission: jest.fn() };
    customers = {
      countDuplicatePhoneRecords: jest.fn().mockResolvedValue(7),
      countTrash: jest.fn().mockResolvedValue(3),
    };
    users = { countPendingApprovals: jest.fn().mockResolvedValue(2) };
    leave = {
      countPending: jest.fn().mockResolvedValue({ count: 5 }),
      countMyPending: jest.fn().mockResolvedValue({ count: 1 }),
    };
    tasks = { countAssignedByStatusCodes: jest.fn().mockResolvedValue({ not_started: 4, in_progress: 2 }) };
    service = new SidebarBadgesService(perms as any, customers as any, users as any, leave as any, tasks as any);
  });

  const employee = { id: 9, role: 'employee', isRootAdmin: false, departmentId: 1, positionId: null };

  it('thiếu mọi permission -> {} và KHÔNG chạy query đếm nào', async () => {
    grant({});
    expect(await service.getBadges(employee)).toEqual({});
    expect(customers.countDuplicatePhoneRecords).not.toHaveBeenCalled();
    expect(customers.countTrash).not.toHaveBeenCalled();
    expect(users.countPendingApprovals).not.toHaveBeenCalled();
    expect(leave.countPending).not.toHaveBeenCalled();
    expect(tasks.countAssignedByStatusCodes).not.toHaveBeenCalled();
  });

  it('chỉ trả field cho permission được cấp, truyền đúng scope', async () => {
    grant({
      'leave_requests.request': null,
      'periodic_tasks.view': PermissionScope.OWN,
      'users.manage': PermissionScope.DEPARTMENT,
    });
    const out = await service.getBadges(employee);
    expect(out).toEqual({ myPendingLeave: 1, taskTodo: 4, taskInProgress: 2, pendingUsers: 2 });
    expect(users.countPendingApprovals).toHaveBeenCalledWith(9, 'employee', PermissionScope.DEPARTMENT);
    expect(tasks.countAssignedByStatusCodes).toHaveBeenCalledWith(
      9, ['not_started', 'in_progress'], 9, 'employee', PermissionScope.OWN,
    );
  });

  it('Root Admin: bypass bảng permission, scope=all cho mọi badge', async () => {
    grant({});
    const out = await service.getBadges({ id: 1, role: 'admin', isRootAdmin: true });
    expect(perms.hasPermission).not.toHaveBeenCalled();
    expect(out).toEqual({
      invalidData: 7, trash: 3, pendingUsers: 2, leaveApprovals: 5, myPendingLeave: 1, taskTodo: 4, taskInProgress: 2,
    });
    expect(leave.countPending).toHaveBeenCalledWith(1, 'admin', PermissionScope.ALL);
  });

  it('admin THƯỜNG (isRootAdmin=false) vẫn đi qua bảng permission', async () => {
    grant({ 'customers.trash_manage': PermissionScope.ALL });
    const out = await service.getBadges({ id: 2, role: 'admin', isRootAdmin: false });
    expect(perms.hasPermission).toHaveBeenCalled();
    expect(out).toEqual({ trash: 3 });
  });

  it('1 badge lỗi không làm hỏng badge khác', async () => {
    grant({ 'customers.trash_manage': PermissionScope.ALL, 'users.manage': PermissionScope.ALL });
    customers.countTrash.mockRejectedValue(new Error('db down'));
    expect(await service.getBadges(employee)).toEqual({ pendingUsers: 2 });
  });

  it('cache số trùng SĐT: lần 2 trong TTL không query lại; hết TTL thì query lại', async () => {
    grant({ 'customers.invalid_report': PermissionScope.ALL });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await service.getBadges(employee);
    await service.getBadges(employee);
    expect(customers.countDuplicatePhoneRecords).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + INVALID_DATA_CACHE_TTL_MS + 1);
    await service.getBadges(employee);
    expect(customers.countDuplicatePhoneRecords).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('cache tách theo user/scope (không rò số giữa người khác phạm vi)', async () => {
    grant({ 'customers.invalid_report': PermissionScope.OWN });
    await service.getBadges(employee);
    await service.getBadges({ ...employee, id: 10 });
    expect(customers.countDuplicatePhoneRecords).toHaveBeenCalledTimes(2);
  });
});
