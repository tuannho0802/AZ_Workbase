import { AuthController } from './auth.controller';

const REQ = { ip: '::ffff:1.2.3.4', headers: { 'user-agent': 'jest-agent', 'x-az-client-ip': '9.9.9.9' } };

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

    const res = await ctl.login(dto as any, REQ as any);

    expect(authService.login).toHaveBeenCalledTimes(1);
    // P3.2/P4: IP lấy từ `req.ip` (KHÔNG tin header x-az-client-ip do client tự gắn) + user-agent để ghi sự kiện bảo mật.
    expect(authService.login).toHaveBeenCalledWith(dto, '1.2.3.4', 'jest-agent', null);
    expect(res).toEqual({ accessToken: 'a', refreshToken: 'r', user: { id: 1 } });
  });

  it('KHÔNG ghi email/mật khẩu ra console (PII, cấm console.* ở BE)', async () => {
    const { ctl } = makeCtl();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await ctl.login({ email: 'user@example.com', password: 'Secret@123' } as any, REQ as any);

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('lỗi từ AuthService vẫn được ném ra nguyên vẹn', async () => {
    const { ctl, authService } = makeCtl();
    authService.login.mockRejectedValue(new Error('Sai thông tin'));
    await expect(ctl.login({ email: 'x@y.z', password: 'p' } as any, REQ as any)).rejects.toThrow('Sai thông tin');
  });

  it('IP giả mạo qua header x-az-client-ip bị bỏ qua ở login (chống né khoá IP)', async () => {
    const { ctl, authService } = makeCtl();
    await ctl.login({ email: 'a@b.co', password: 'p' } as any, { ip: '5.5.5.5', headers: { 'x-az-client-ip': '8.8.8.8' } } as any);
    expect(authService.login.mock.calls[0][1]).toBe('5.5.5.5');
  });
});
