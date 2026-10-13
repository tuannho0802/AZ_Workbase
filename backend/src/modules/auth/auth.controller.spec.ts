import { AuthController } from './auth.controller';

describe('AuthController.login (PLAN CPU Mục 13F)', () => {
  const makeCtl = () => {
    const authService: any = {
      login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 1 } }),
    };
    return { ctl: new AuthController(authService), authService };
  };

  afterEach(() => jest.restoreAllMocks());

  it('chuyển nguyên DTO sang AuthService.login và trả đúng kết quả (hành vi không đổi)', async () => {
    const { ctl, authService } = makeCtl();
    const dto = { email: 'user@example.com', password: 'Secret@123' };

    const res = await ctl.login(dto as any);

    expect(authService.login).toHaveBeenCalledTimes(1);
    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ accessToken: 'a', refreshToken: 'r', user: { id: 1 } });
  });

  it('KHÔNG ghi email/mật khẩu ra console (PII, cấm console.* ở BE)', async () => {
    const { ctl } = makeCtl();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await ctl.login({ email: 'user@example.com', password: 'Secret@123' } as any);

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('lỗi từ AuthService vẫn được ném ra nguyên vẹn', async () => {
    const { ctl, authService } = makeCtl();
    authService.login.mockRejectedValue(new Error('Sai thông tin'));
    await expect(ctl.login({ email: 'x@y.z', password: 'p' } as any)).rejects.toThrow('Sai thông tin');
  });
});
