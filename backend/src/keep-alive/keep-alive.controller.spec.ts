import { Logger } from '@nestjs/common';
import { KeepAliveController } from './keep-alive.controller';

describe('KeepAliveController (Plan CPU mục 7B)', () => {
  const makeCtl = () => {
    const ds: any = { isInitialized: true, query: jest.fn().mockResolvedValue([{ alive: 1 }]) };
    return { ctl: new KeepAliveController(ds), ds };
  };
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('HEAD: vẫn SELECT 1 nhưng KHÔNG ghi log', async () => {
    const { ctl, ds } = makeCtl();
    const res = await ctl.ping({ method: 'HEAD' } as any);
    expect(ds.query).toHaveBeenCalledWith('SELECT 1 as alive');
    expect(res.status).toBe('ok');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('GET: vẫn ghi log như cũ và response không đổi', async () => {
    const { ctl } = makeCtl();
    const res: any = await ctl.ping({ method: 'GET' } as any);
    expect(res).toMatchObject({ status: 'ok', db: { alive: 1 } });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
