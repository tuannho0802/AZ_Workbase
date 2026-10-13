import { NotFoundException } from '@nestjs/common';
import { PeriodicTasksService } from './periodic-tasks.service';

/**
 * [PERF 14B-2] `findOne()` chỉ select `id,name` cho primaryAssignee/createdBy/updatedBy (không User đầy đủ),
 * vẫn giữ status/department đầy đủ + cùng phạm vi xem + cùng 404.
 */
describe('PeriodicTasksService.findOne (14B-2)', () => {
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
    service.taskRepo = { createQueryBuilder: jest.fn(() => qb) };
    return { service, calls };
  };

  it('User chỉ id/name; status + department vẫn join đầy đủ', async () => {
    const { service, calls } = build({ id: 1 });
    const res = await service.findOne(1, 7, 'admin', null);
    expect(res).toEqual({ id: 1 });
    expect(calls.full).toEqual(['task.status', 'task.department']);
    expect(calls.light).toEqual(['task.primaryAssignee', 'task.createdBy', 'task.updatedBy']);
    expect(calls.selects.flat()).toEqual([
      'primaryAssignee.id', 'primaryAssignee.name', 'createdBy.id', 'createdBy.name', 'updatedBy.id', 'updatedBy.name',
    ]);
  });

  it('không thấy / ngoài phạm vi -> NotFoundException', async () => {
    const { service } = build(null);
    await expect(service.findOne(1, 7, 'employee', 'own')).rejects.toBeInstanceOf(NotFoundException);
  });
});
