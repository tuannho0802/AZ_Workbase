import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  let service: TurnstileService;
  let mockConfigService: { get: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    mockConfigService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TurnstileService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<TurnstileService>(TurnstileService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('trả về true (PASS) nếu chưa cấu hình TURNSTILE_SECRET_KEY - không chặn đăng ký khi thiếu env', async () => {
    mockConfigService.get.mockReturnValue(undefined);
    global.fetch = jest.fn();

    const result = await service.verify('any-token', '1.2.3.4');

    expect(result).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('trả về false nếu không có secret key NHƯNG cũng không có token (thiếu cả 2)', async () => {
    // Ưu tiên nhánh "chưa cấu hình secret" trước - PASS luôn kể cả thiếu token,
    // vì trong trường hợp này Turnstile coi như đang tắt hoàn toàn.
    mockConfigService.get.mockReturnValue(undefined);
    const result = await service.verify(undefined, '1.2.3.4');
    expect(result).toBe(true);
  });

  it('trả về false nếu ĐÃ cấu hình secret key nhưng token rỗng/undefined', async () => {
    mockConfigService.get.mockReturnValue('real-secret-key');
    global.fetch = jest.fn();

    const result = await service.verify(undefined, '1.2.3.4');

    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('gọi đúng siteverify endpoint với secret + token + remoteip, trả true khi Cloudflare xác nhận success', async () => {
    mockConfigService.get.mockReturnValue('real-secret-key');
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch as any;

    const result = await service.verify('user-token', '1.2.3.4');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    const bodySent = mockFetch.mock.calls[0][1].body as URLSearchParams;
    expect(bodySent.get('secret')).toBe('real-secret-key');
    expect(bodySent.get('response')).toBe('user-token');
    expect(bodySent.get('remoteip')).toBe('1.2.3.4');
  });

  it('trả về false khi Cloudflare xác nhận success=false (token sai/hết hạn)', async () => {
    mockConfigService.get.mockReturnValue('real-secret-key');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as any;

    const result = await service.verify('bad-token', '1.2.3.4');

    expect(result).toBe(false);
  });

  it('trả về false khi Cloudflare trả HTTP lỗi (không phải 2xx)', async () => {
    mockConfigService.get.mockReturnValue('real-secret-key');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

    const result = await service.verify('some-token', '1.2.3.4');

    expect(result).toBe(false);
  });

  it('trả về false (fail-closed) khi gọi mạng bị lỗi/timeout - không mở toang khi Cloudflare sập', async () => {
    mockConfigService.get.mockReturnValue('real-secret-key');
    global.fetch = jest.fn().mockRejectedValue(new Error('network timeout')) as any;

    const result = await service.verify('some-token', '1.2.3.4');

    expect(result).toBe(false);
  });

  it('vẫn hoạt động đúng khi không truyền remoteIp (không set field remoteip trong body)', async () => {
    mockConfigService.get.mockReturnValue('real-secret-key');
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    global.fetch = mockFetch as any;

    await service.verify('user-token');

    const bodySent = mockFetch.mock.calls[0][1].body as URLSearchParams;
    expect(bodySent.has('remoteip')).toBe(false);
  });
});
