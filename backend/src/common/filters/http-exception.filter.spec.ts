import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter } from './http-exception.filter';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
}));

describe('AllExceptionsFilter - Sentry (PLAN_HARDENING P5)', () => {
  const originalVercel = process.env.VERCEL;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/x', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;
    delete process.env.VERCEL;
  });

  afterAll(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it('gửi lỗi 5xx (Error thường) lên Sentry và vẫn trả 500', () => {
    const err = new Error('boom');
    new AllExceptionsFilter().catch(err, host);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalled();
  });

  it('gửi HttpException 5xx lên Sentry', () => {
    new AllExceptionsFilter().catch(new InternalServerErrorException(), host);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['400 validation', new BadRequestException(['name must be a string'])],
    ['403', new ForbiddenException()],
  ])('KHÔNG gửi lỗi 4xx lên Sentry (%s)', (_label, err) => {
    new AllExceptionsFilter().catch(err, host);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalled();
  });

  it('trên Vercel: flush xong mới trả response, và vẫn trả khi flush lỗi', async () => {
    process.env.VERCEL = '1';
    const result = new AllExceptionsFilter().catch(new Error('boom'), host);
    expect(json).not.toHaveBeenCalled();
    await result;
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
    expect(json).toHaveBeenCalledTimes(1);

    (Sentry.flush as jest.Mock).mockRejectedValueOnce(new Error('network'));
    json.mockClear();
    await new AllExceptionsFilter().catch(new Error('boom2'), host);
    expect(json).toHaveBeenCalledTimes(1);
  });

  it('lỗi nghiệp vụ có `code` (vd Guard checklist 409) -> chuyển tiếp code + số liệu cho FE', () => {
    new AllExceptionsFilter().catch(
      new ConflictException({ code: 'CHECKLIST_GUARD', guard: 'complete', total: 5, done: 3, message: 'Còn 2/5' }),
      host,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Còn 2/5', code: 'CHECKLIST_GUARD', guard: 'complete', total: 5, done: 3 }),
    );
  });

  it('lỗi thường KHÔNG có `code` -> response giữ nguyên hình dạng cũ (không rò field lạ)', () => {
    new AllExceptionsFilter().catch(new BadRequestException('sai'), host);
    const body = json.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual(['message', 'method', 'path', 'statusCode', 'timestamp']);
  });

  describe('log gọn cho lỗi 4xx (Fluid CPU)', () => {
    it('401 -> KHÔNG log gì (không console.error, không warn)', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      new AllExceptionsFilter().catch(new UnauthorizedException('hết hạn'), host);
      expect(console.error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('403/400 -> 1 dòng warn, KHÔNG console.error, KHÔNG stack', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      new AllExceptionsFilter().catch(new ForbiddenException('cấm'), host);
      new AllExceptionsFilter().catch(new BadRequestException(['a sai', 'b sai']), host);
      expect(console.error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0][0]).toContain('403 GET /api/x');
      expect(warn.mock.calls[1][0]).toContain('a sai; b sai');
      expect(String(warn.mock.calls[0][0])).not.toContain('at ');
    });

    it('5xx -> vẫn console.error kèm stack', () => {
      new AllExceptionsFilter().catch(new Error('boom'), host);
      expect(console.error).toHaveBeenCalledWith(
        '[EXCEPTION FILTER] Error:',
        expect.objectContaining({ status: 500, stack: expect.stringContaining('boom') }),
      );
    });
  });
});
