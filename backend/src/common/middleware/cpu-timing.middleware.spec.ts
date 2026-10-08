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
    expect(String(logSpy.mock.calls[0][0])).toMatch(/^cpu=\d+\.\d+ms wall=\d+ms GET \/api\/users\/me 304 inflight=1 up=\d+s$/);
    logSpy.mockRestore();
  });

  it('[12I] inflight = số request chạy chồng nhau cao nhất trong đời request; request chạy một mình = 1', () => {
    const logSpy = jest.spyOn((require('@nestjs/common').Logger.prototype as any), 'log').mockImplementation(() => undefined);
    const mk = () => Object.assign(new EventEmitter(), { statusCode: 200 }) as any;
    const req = { method: 'GET', originalUrl: '/api/x', url: '/api/x' } as any;
    const a = mk();
    const b = mk();
    cpuTimingMiddleware(req, a, jest.fn());
    cpuTimingMiddleware(req, b, jest.fn()); // b bắt đầu khi a còn chạy -> cả hai thấy 2
    a.emit('finish');
    b.emit('finish');
    const c = mk();
    cpuTimingMiddleware(req, c, jest.fn()); // chạy một mình
    c.emit('finish');
    const lines = logSpy.mock.calls.map((x) => String(x[0]));
    expect(lines[0]).toContain('inflight=2');
    expect(lines[1]).toContain('inflight=2');
    expect(lines[2]).toContain('inflight=1');
    logSpy.mockRestore();
  });

  it('[12I] request bị huỷ giữa chừng (close, không finish) không làm kẹt bộ đếm', () => {
    const logSpy = jest.spyOn((require('@nestjs/common').Logger.prototype as any), 'log').mockImplementation(() => undefined);
    const mk = () => Object.assign(new EventEmitter(), { statusCode: 200 }) as any;
    const req = { method: 'GET', originalUrl: '/api/x', url: '/api/x' } as any;
    const aborted = mk();
    cpuTimingMiddleware(req, aborted, jest.fn());
    aborted.emit('close');
    const next = mk();
    cpuTimingMiddleware(req, next, jest.fn());
    next.emit('finish');
    expect(String(logSpy.mock.calls.at(-1)?.[0])).toContain('inflight=1');
    logSpy.mockRestore();
  });
});
