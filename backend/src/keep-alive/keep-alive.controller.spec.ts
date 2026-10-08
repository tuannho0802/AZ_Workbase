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

  it('HEAD trùng nhau (song song hoặc < 15s): chỉ 1 SELECT 1', async () => {
    const { ctl, ds } = makeCtl();
    await Promise.all([ctl.ping({ method: 'HEAD' } as any), ctl.ping({ method: 'HEAD' } as any)]);
    await ctl.ping({ method: 'HEAD' } as any);
    expect(ds.query).toHaveBeenCalledTimes(1);
  });

  it('GET luôn SELECT 1 thật, không dùng cache của HEAD', async () => {
    const { ctl, ds } = makeCtl();
    await ctl.ping({ method: 'HEAD' } as any);
    await ctl.ping({ method: 'GET' } as any);
    expect(ds.query).toHaveBeenCalledTimes(2);
  });

  it('HEAD lỗi DB không bị cache: lần sau thử lại', async () => {
    const { ctl, ds } = makeCtl();
    ds.query.mockRejectedValueOnce(new Error('ECONNRESET'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await ctl.ping({ method: 'HEAD' } as any);
    ds.isInitialized = true;
    const res: any = await ctl.ping({ method: 'HEAD' } as any);
    expect(res.status).toBe('ok');
  });
});
