import { RANGE_CLEANUP_BATCH_SIZE, countActionsInRanges, runRangeCleanup } from './range-cleanup.util';

const R = [{ from: '2026-01-01', to: '2026-01-31' }];

describe('runRangeCleanup', () => {
  it('dryRun chỉ SELECT COUNT, không DELETE', async () => {
    const query = jest.fn().mockResolvedValue([{ c: '12' }]);
    const res = await runRangeCleanup({ query, table: 'audit_logs', ranges: R, dryRun: true });
    expect(res).toEqual({ perRange: [{ ...R[0], count: 12 }], total: 12, partial: false });
    expect(query.mock.calls.every(([sql]) => /^SELECT COUNT/.test(sql as string))).toBe(true);
  });

  it('so sánh created_at bằng cận UTC (đã lùi 7h), không dùng chuỗi ngày thô', async () => {
    const query = jest.fn().mockResolvedValue([{ c: 0 }]);
    await runRangeCleanup({ query, table: 'audit_logs', ranges: R, dryRun: true });
    expect(query.mock.calls[0][1]).toEqual(['2025-12-31 17:00:00', '2026-01-31 17:00:00']);
  });

  it('loại trừ action được bảo vệ bằng NOT IN', async () => {
    const query = jest.fn().mockResolvedValue([{ c: 0 }]);
    await runRangeCleanup({ query, table: 'audit_logs', ranges: R, excludeActions: ['UNLOCK_LOGIN'], dryRun: true });
    expect(query.mock.calls[0][0]).toContain('action NOT IN (?)');
    expect(query.mock.calls[0][1]).toContain('UNLOCK_LOGIN');
  });

  it('xoá theo lô cho tới khi lô cuối chưa đầy', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ affectedRows: RANGE_CLEANUP_BATCH_SIZE })
      .mockResolvedValueOnce({ affectedRows: 7 });
    const res = await runRangeCleanup({ query, table: 'periodic_task_audit_logs', ranges: R, dryRun: false });
    expect(res.total).toBe(RANGE_CLEANUP_BATCH_SIZE + 7);
    expect(res.partial).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain(`LIMIT ${RANGE_CLEANUP_BATCH_SIZE}`);
  });

  it('hết ngân sách thời gian -> partial=true và bỏ qua khoảng còn lại', async () => {
    const query = jest.fn().mockResolvedValue({ affectedRows: RANGE_CLEANUP_BATCH_SIZE });
    const two = [R[0], { from: '2026-03-01', to: '2026-03-05' }];
    const res = await runRangeCleanup({ query, table: 'audit_logs', ranges: two, dryRun: false, budgetMs: -1 });
    expect(res.partial).toBe(true);
    expect(res.perRange[1].count).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('countActionsInRanges', () => {
  it('không có action -> 0, không query', async () => {
    const query = jest.fn();
    expect(await countActionsInRanges(query, R, [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
  it('cộng dồn theo từng khoảng', async () => {
    const query = jest.fn().mockResolvedValue([{ c: '3' }]);
    expect(await countActionsInRanges(query, [R[0], R[0]], ['UNLOCK_LOGIN'])).toBe(6);
  });
});
