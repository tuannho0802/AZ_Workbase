import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { assertCronSecret, RetentionCronController } from './retention-cron.controller';
import { RetentionController } from './retention.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('assertCronSecret', () => {
  const OLD = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = OLD;
  });

  it('thiếu CRON_SECRET trên server -> 503', () => {
    delete process.env.CRON_SECRET;
    expect(() => assertCronSecret('Bearer x')).toThrow(HttpException);
  });
  it('sai/thiếu secret -> 401', () => {
    process.env.CRON_SECRET = 'abcdefgh';
    expect(() => assertCronSecret(undefined, undefined)).toThrow(HttpException);
    expect(() => assertCronSecret('Bearer abcdefgX')).toThrow(HttpException);
    expect(() => assertCronSecret('Bearer short')).toThrow(HttpException);
  });
  it('đúng secret qua Bearer hoặc x-cron-secret -> qua', () => {
    process.env.CRON_SECRET = 'abcdefgh';
    expect(() => assertCronSecret('Bearer abcdefgh')).not.toThrow();
    expect(() => assertCronSecret(undefined, 'abcdefgh')).not.toThrow();
  });
});

describe('RetentionCronController', () => {
  it('chỉ gọi runIfDue khi secret hợp lệ', async () => {
    process.env.CRON_SECRET = 'abcdefgh';
    const svc = { runIfDue: jest.fn().mockResolvedValue({ skipped: true }) };
    const c = new RetentionCronController(svc as never);
    await expect(c.runRetention('Bearer nope')).rejects.toBeInstanceOf(HttpException);
    expect(svc.runIfDue).not.toHaveBeenCalled();
    await expect(c.runRetention('Bearer abcdefgh')).resolves.toEqual({ skipped: true });
  });
});

describe('RetentionController - khoá guard/permission', () => {
  it('gắn JwtAuthGuard + PermissionGuard ở mức class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RetentionController) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual(['JwtAuthGuard', 'PermissionGuard']);
  });

  it.each([
    ['getSettings', 'audit.view'],
    ['updateSettings', 'audit.manage'],
    ['runNow', 'audit.manage'],
  ])('%s yêu cầu %s', (method, key) => {
    const handler = (RetentionController.prototype as unknown as Record<string, () => void>)[method];
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe(key);
  });

  it('runNow thật toàn bộ/chấm công bị chặn với non-admin; dryRun thì cho', async () => {
    const svc = { run: jest.fn().mockResolvedValue({}) };
    const c = new RetentionController(svc as never);
    const manager = { user: { id: 2, role: 'manager' } };
    expect(() => c.runNow({ dryRun: 'false' }, manager)).toThrow();
    expect(() => c.runNow({ target: 'attendance_logs' }, manager)).toThrow();
    await c.runNow({ dryRun: 'true' }, manager);
    await c.runNow({ target: 'notifications' }, manager);
    expect(svc.run).toHaveBeenCalledTimes(2);
  });
});
