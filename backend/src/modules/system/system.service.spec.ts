import { HttpException, HttpStatus } from '@nestjs/common';
import { SYSTEM_RESET_COOLDOWN_MS, SystemService } from './system.service';

describe('SystemService.reset', () => {
  const make = (state: { value: number; updatedAt: Date | null }, bump = jest.fn().mockResolvedValue(state.value + 1)) => {
    const getEpochState = jest.fn().mockResolvedValue(state);
    const logActionAsync = jest.fn();
    const svc = new SystemService({ getEpochState, bumpEpoch: bump } as never, { logActionAsync } as never);
    return { svc, bump, logActionAsync };
  };

  it('chưa từng reset -> tăng epoch, trả epoch mới, ghi audit SYSTEM_RESET', async () => {
    const { svc, bump, logActionAsync } = make({ value: 0, updatedAt: null });
    const res = await svc.reset({ id: 9 }, '1.2.3.4', 'UA');
    expect(bump).toHaveBeenCalledTimes(1);
    expect(res.epoch).toBe(1);
    expect(Number.isNaN(Date.parse(res.resetAt))).toBe(false);
    expect(logActionAsync).toHaveBeenCalledWith(9, 'SYSTEM_RESET', 'system', 1, { epoch: 0 }, { epoch: 1 }, '1.2.3.4', 'UA');
  });

  it('reset lần trước đã quá cooldown -> cho phép', async () => {
    const { svc, bump } = make({ value: 4, updatedAt: new Date(Date.now() - SYSTEM_RESET_COOLDOWN_MS - 1000) });
    await expect(svc.reset({ id: 1 })).resolves.toMatchObject({ epoch: 5 });
    expect(bump).toHaveBeenCalled();
  });

  it('còn trong cooldown -> 429, KHÔNG tăng epoch, KHÔNG audit', async () => {
    const { svc, bump, logActionAsync } = make({ value: 4, updatedAt: new Date(Date.now() - 5000) });
    const err = await svc.reset({ id: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(bump).not.toHaveBeenCalled();
    expect(logActionAsync).not.toHaveBeenCalled();
  });

  it('ghi epoch lỗi -> throw (người bấm biết thất bại), không audit', async () => {
    const { svc, logActionAsync } = make({ value: 0, updatedAt: null }, jest.fn().mockRejectedValue(new Error('db down')));
    await expect(svc.reset({ id: 1 })).rejects.toThrow('db down');
    expect(logActionAsync).not.toHaveBeenCalled();
  });
});
