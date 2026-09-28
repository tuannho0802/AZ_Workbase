import * as dateVnUtil from '../../common/utils/date-vn.util';
import { PeriodicTaskAutoOverdueService } from './periodic-task-auto-overdue.service';
import { AUTO_LOCK_NOTE } from './helpers/overdue.helper';

describe('PeriodicTaskAutoOverdueService', () => {
  const makeSelectQb = (rows: any[]) => ({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  });
  const makeUpdateQb = () => {
    const qb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return qb;
  };

  const setup = (rows: any[]) => {
    const selectQb = makeSelectQb(rows);
    const updateQbs: any[] = [];
    const repo: any = {
      createQueryBuilder: jest.fn().mockImplementation((alias?: string) => {
        if (alias) return selectQb;
        const q = makeUpdateQb();
        updateQbs.push(q);
        return q;
      }),
    };
    return { service: new PeriodicTaskAutoOverdueService(repo), selectQb, updateQbs };
  };

  beforeEach(() => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-28');
  });
  afterEach(() => jest.restoreAllMocks());

  it('mốc quá ân hạn = hôm nay - 7 ngày (period_end_date < 2026-09-21)', async () => {
    const { service, selectQb } = setup([]);
    const res = await service.runSweep();
    expect(res.cutoffPeriodEnd).toBe('2026-09-21');
    const cutoffCall = (selectQb.andWhere.mock.calls as any[][]).find((c) => String(c[0]).includes('task.periodEndDate < :cutoff'));
    expect(cutoffCall?.[1]).toEqual({ cutoff: '2026-09-21' });
    const statusCall = (selectQb.andWhere.mock.calls as any[][]).find((c) => String(c[0]).includes('status.code'));
    expect(statusCall?.[1]).toEqual({ doneCodes: ['in_review', 'done'] });
  });

  it('chưa đánh dấu -> đánh dấu; chưa khoá -> khoá; đã đánh dấu + đã khoá thì không đụng', async () => {
    const { service, updateQbs } = setup([
      { id: 1, overdueMarkedAt: null, isLocked: false }, // cả 2
      { id: 2, overdueMarkedAt: new Date(), isLocked: false }, // chỉ khoá
      { id: 3, overdueMarkedAt: null, isLocked: true }, // chỉ đánh dấu (khoá tay giữ nguyên)
    ]);
    const res = await service.runSweep();

    expect(res.candidates).toBe(3);
    expect(res.markedTaskIds).toEqual([1, 3]);
    expect(res.lockedTaskIds).toEqual([1, 2]);

    const markQb = updateQbs.find((q) => 'overdueMarkedAt' in q.set.mock.calls[0][0]);
    expect(markQb.set.mock.calls[0][0]).toMatchObject({ overdueMarkedById: null });
    expect(markQb.whereInIds).toHaveBeenCalledWith([1, 3]);

    const lockQb = updateQbs.find((q) => 'isLocked' in q.set.mock.calls[0][0]);
    expect(lockQb.set.mock.calls[0][0]).toMatchObject({ isLocked: true, lockedById: null, lockNote: AUTO_LOCK_NOTE });
    expect(lockQb.whereInIds).toHaveBeenCalledWith([1, 2]);
  });

  it('dryRun=true -> chỉ đếm, KHÔNG update', async () => {
    const { service, updateQbs } = setup([{ id: 1, overdueMarkedAt: null, isLocked: false }]);
    const res = await service.runSweep({ dryRun: true });
    expect(res).toMatchObject({ dryRun: true, markedOverdue: 1, locked: 1 });
    expect(updateQbs).toHaveLength(0);
  });

  it('không có ứng viên -> không update gì', async () => {
    const { service, updateQbs } = setup([]);
    const res = await service.runSweep();
    expect(res).toMatchObject({ candidates: 0, markedOverdue: 0, locked: 0 });
    expect(updateQbs).toHaveLength(0);
  });
});
