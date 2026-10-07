import { SidebarBadgesService, INVALID_DATA_CACHE_TTL_MS } from './sidebar-badges.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';

describe('SidebarBadgesService', () => {
  let perms: { hasPermission: jest.Mock };
  let customers: { countDuplicatePhoneRecords: jest.Mock; countTrash: jest.Mock };
  let users: { countPendingApprovals: jest.Mock };
  let leave: { countPending: jest.Mock; countMyPending: jest.Mock };
  let tasks: { countAssignedByStatusCodes: jest.Mock };
  let service: SidebarBadgesService;
  let version: { getEpoch: jest.Mock };

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
    version = { getEpoch: jest.fn().mockResolvedValue(0) };
    service = new SidebarBadgesService(perms as any, customers as any, users as any, leave as any, tasks as any, version as any);
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

  it('cache số trùng SĐT + epoch (Reset hệ thống): epoch đổi -> tính lại ngay, không chờ hết TTL', async () => {
    grant({ 'customers.invalid_report': PermissionScope.ALL });
    version.getEpoch.mockResolvedValue(1);
    await service.getBadges(employee);
    await service.getBadges(employee);
    expect(customers.countDuplicatePhoneRecords).toHaveBeenCalledTimes(1);
    version.getEpoch.mockResolvedValue(2);
    await service.getBadges(employee);
    expect(customers.countDuplicatePhoneRecords).toHaveBeenCalledTimes(2);
  });

  it('cache tách theo user/scope (không rò số giữa người khác phạm vi)', async () => {
    grant({ 'customers.invalid_report': PermissionScope.OWN });
    await service.getBadges(employee);
    await service.getBadges({ ...employee, id: 10 });
    expect(customers.countDuplicatePhoneRecords).toHaveBeenCalledTimes(2);
  });
  describe('CPU_TIMING (Mục 5A - chỉ đo, không đổi hành vi)', () => {
    const OLD = process.env.CPU_TIMING;
    afterEach(() => {
      if (OLD === undefined) delete process.env.CPU_TIMING;
      else process.env.CPU_TIMING = OLD;
      jest.restoreAllMocks();
    });
    const all = {
      'customers.invalid_report': PermissionScope.ALL,
      'customers.trash_manage': PermissionScope.ALL,
      'users.manage': PermissionScope.ALL,
      'leave_requests.approve': PermissionScope.ALL,
      'leave_requests.request': PermissionScope.OWN,
      'periodic_tasks.view': PermissionScope.ALL,
    };

    it('tắt: kết quả đúng và KHÔNG ghi log [Badges]', async () => {
      delete process.env.CPU_TIMING;
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
      grant(all);
      const out = await service.getBadges(employee);
      expect(out).toEqual({ invalidData: 7, trash: 3, pendingUsers: 2, leaveApprovals: 5, myPendingLeave: 1, taskTodo: 4, taskInProgress: 2 });
      expect(log).not.toHaveBeenCalled();
    });

    it('bật: kết quả GIỐNG HỆT khi tắt + log 1 dòng có đủ 6 job và cache MISS rồi HIT', async () => {
      process.env.CPU_TIMING = 'true';
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
      grant(all);
      const out = await service.getBadges(employee);
      expect(out).toEqual({ invalidData: 7, trash: 3, pendingUsers: 2, leaveApprovals: 5, myPendingLeave: 1, taskTodo: 4, taskInProgress: 2 });
      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0][0]);
      for (const k of ['invalidData=', 'trash=', 'pendingUsers=', 'leaveApprovals=', 'myPendingLeave=', 'tasks=', 'perm=', 'total=']) {
        expect(line).toContain(k);
      }
      expect(line).toContain('invalidData.cache=MISS');
      await service.getBadges(employee);
      expect(String(log.mock.calls[1][0])).toContain('invalidData.cache=HIT');
    });

    it('bật: 1 badge lỗi vẫn không hỏng badge khác và vẫn được đo', async () => {
      process.env.CPU_TIMING = 'true';
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
      jest.spyOn((service as any).logger, 'warn').mockImplementation();
      grant({ 'customers.trash_manage': PermissionScope.ALL, 'users.manage': PermissionScope.ALL });
      customers.countTrash.mockRejectedValue(new Error('db down'));
      expect(await service.getBadges(employee)).toEqual({ pendingUsers: 2 });
      expect(String(log.mock.calls[0][0])).toContain('trash=');
    });

    it('bật: 2 request song song không lẫn số đo của nhau', async () => {
      process.env.CPU_TIMING = 'true';
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation();
      grant({ 'customers.trash_manage': PermissionScope.ALL });
      await Promise.all([service.getBadges(employee), service.getBadges({ ...employee, id: 10 })]);
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toHaveLength(2);
      expect(lines.find((l) => l.includes('user=9'))).toBeDefined();
      expect(lines.find((l) => l.includes('user=10'))).toBeDefined();
      for (const l of lines) expect(l.match(/trash=/g)).toHaveLength(1);
    });
  });
});
