import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
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
});
