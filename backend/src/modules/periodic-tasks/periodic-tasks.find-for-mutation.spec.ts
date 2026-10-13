import { NotFoundException } from '@nestjs/common';
import { PeriodicTasksService } from './periodic-tasks.service';

/**
 * [PERF 14B-2 bullet 2] `findForMutation()` - bản nhẹ của `findOne()` cho lock/unlock/markOverdue/
 * unmarkOverdue/remove: chỉ cột Task + `status` (KHÔNG join User). `remove` thêm primaryAssignee(id,name)
 * + department cho `buildAuditSnapshot()`, vẫn bỏ createdBy/updatedBy. Cùng cổng scope + cùng 404.
 */
describe('PeriodicTasksService.findForMutation (14B-2)', () => {
  const USER: any = { id: 7, role: 'admin' };

  const build = (task: any) => {
    const calls = { full: [] as string[], light: [] as string[], selects: [] as string[][] };
    const qb: any = {
      leftJoinAndSelect: jest.fn((rel: string) => (calls.full.push(rel), qb)),
      leftJoin: jest.fn((rel: string) => (calls.light.push(rel), qb)),
      addSelect: jest.fn((c: string[]) => (calls.selects.push(c), qb)),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(task),
    };
    const service: any = Object.create(PeriodicTasksService.prototype);
    service.taskRepo = {
      createQueryBuilder: jest.fn(() => qb),
      save: jest.fn(async (t: any) => t),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    service.auditService = { logActionAsync: jest.fn() };
    service.notifyTaskSafely = jest.fn();
    jest.spyOn(service, 'findOne');
    return { service, calls, qb };
  };

  const baseTask = () => ({
    id: 1, title: 'T', isLocked: false, periodEndDate: '2020-01-01', overdueMarkedAt: null,
    createdById: 7, primaryAssigneeId: 5, status: { code: 'in_progress', isDoneState: false },
  });

  it('bản mặc định: chỉ join status, KHÔNG join User/department', async () => {
    const { service, calls } = build(baseTask());
    await service.lock(1, { lockNote: 'x' }, USER, null);
    expect(calls.full).toEqual(['task.status']);
    expect(calls.light).toEqual([]);
    expect(calls.selects).toEqual([]);
  });

  it('lock/unlock/markOverdue/unmarkOverdue KHÔNG còn gọi findOne()', async () => {
    const t1 = build(baseTask());
    await t1.service.lock(1, {}, USER, null);
    await t1.service.unlock(1, USER, null);
    const t2 = build(baseTask());
    await t2.service.markOverdue(1, USER, null);
    const t3 = build({ ...baseTask(), overdueMarkedAt: new Date() });
    await t3.service.unmarkOverdue(1, USER, null);
    for (const t of [t1, t2, t3]) expect(t.service.findOne).not.toHaveBeenCalled();
  });

  it('lock ghi đúng cột khoá + audit; unlock xoá cột khoá', async () => {
    const { service } = build(baseTask());
    const locked = await service.lock(1, { lockNote: 'n' }, USER, null);
    expect(locked).toMatchObject({ isLocked: true, lockedById: 7, lockNote: 'n' });
    const unlocked = await service.unlock(1, USER, null);
    expect(unlocked).toMatchObject({ isLocked: false, lockedById: null, lockedAt: null, lockNote: null });
    expect(service.auditService.logActionAsync).toHaveBeenCalledTimes(2);
  });

  it('markOverdue đặt dấu + người đánh dấu; unmarkOverdue gỡ dấu', async () => {
    const m = build(baseTask());
    const marked = await m.service.markOverdue(1, USER, null);
    expect(marked.overdueMarkedAt).toBeInstanceOf(Date);
    expect(marked.overdueMarkedById).toBe(7);
    const u = build({ ...baseTask(), overdueMarkedAt: new Date(), overdueMarkedById: 7 });
    const cleared = await u.service.unmarkOverdue(1, USER, null);
    expect(cleared).toMatchObject({ overdueMarkedAt: null, overdueMarkedById: null });
  });

  it('remove: thêm primaryAssignee(id,name) + department, KHÔNG join createdBy/updatedBy', async () => {
    const { service, calls } = build(baseTask());
    await service.remove(1, 7, 'admin', null);
    expect(calls.full).toEqual(['task.status', 'task.department']);
    expect(calls.light).toEqual(['task.primaryAssignee']);
    expect(calls.selects.flat()).toEqual(['primaryAssignee.id', 'primaryAssignee.name']);
    expect(service.findOne).not.toHaveBeenCalled();
    expect(service.taskRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('remove: audit snapshot vẫn ghi đúng người phụ trách và phòng ban', async () => {
    const task = {
      ...baseTask(),
      primaryAssignee: { id: 5, name: 'Nguyễn Văn A' },
      department: { id: 2, name: 'Phòng Sales', color: '#fff' },
    };
    const { service } = build(task);
    await service.remove(1, 7, 'admin', null);
    const snapshot = JSON.stringify(service.auditService.logActionAsync.mock.calls[0][3]);
    expect(snapshot).toContain('Nguyễn Văn A');
    expect(snapshot).toContain('Phòng Sales');
  });

  it.each(['lock', 'unlock', 'markOverdue', 'unmarkOverdue', 'remove'])('%s: Task không thấy/ngoài scope -> NotFoundException, KHÔNG lưu', async (fn) => {
    const { service } = build(null);
    const run = () =>
      fn === 'lock' ? service.lock(1, {}, USER, 'own')
      : fn === 'remove' ? service.remove(1, 7, 'employee', 'own')
      : service[fn](1, USER, 'own');
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    expect(service.taskRepo.save).not.toHaveBeenCalled();
    expect(service.taskRepo.softDelete).not.toHaveBeenCalled();
  });
});
