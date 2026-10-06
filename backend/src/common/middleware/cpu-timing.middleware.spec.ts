import { EventEmitter } from 'events';
import { cpuTimingMiddleware, normalizeRoute } from './cpu-timing.middleware';

describe('cpu-timing.middleware', () => {
  it('normalizeRoute gom id số và bỏ query string', () => {
    expect(normalizeRoute('/api/customers/123?x=1')).toBe('/api/customers/:id');
    expect(normalizeRoute('/api/periodic-tasks/5/checklist-items/9')).toBe('/api/periodic-tasks/:id/checklist-items/:id');
    expect(normalizeRoute('/api/notifications/poll')).toBe('/api/notifications/poll');
  });

  it('gọi next() ngay và log 1 dòng khi response finish', () => {
    const res: any = new EventEmitter();
    res.statusCode = 304;
    const next = jest.fn();
    const logSpy = jest.spyOn((require('@nestjs/common').Logger.prototype as any), 'log').mockImplementation(() => undefined);
    cpuTimingMiddleware({ method: 'GET', originalUrl: '/api/users/me', url: '/api/users/me' } as any, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0][0])).toMatch(/^cpu=\d+\.\d+ms wall=\d+ms GET \/api\/users\/me 304$/);
    logSpy.mockRestore();
  });
});
