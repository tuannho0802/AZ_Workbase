import { BadgeCacheInvalidationMiddleware, shouldInvalidateBadges } from './badge-cache-invalidation.middleware';

describe('shouldInvalidateBadges', () => {
  it('ghi thành công -> xoá cache', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(shouldInvalidateBadges(m, '/api/customers/1', 200)).toBe(true);
    }
    expect(shouldInvalidateBadges('POST', '/api/leave-requests?x=1', 201)).toBe(true);
  });
  it('GET/HEAD/OPTIONS -> không', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', undefined]) {
      expect(shouldInvalidateBadges(m as any, '/api/customers', 200)).toBe(false);
    }
  });
  it('request lỗi (4xx/5xx) -> không (dữ liệu không đổi)', () => {
    expect(shouldInvalidateBadges('POST', '/api/customers', 400)).toBe(false);
    expect(shouldInvalidateBadges('DELETE', '/api/customers/1', 500)).toBe(false);
  });
  it('đường dẫn bỏ qua: iclock, auth, notifications', () => {
    expect(shouldInvalidateBadges('POST', '/iclock/cdata?table=ATTLOG', 200)).toBe(false);
    expect(shouldInvalidateBadges('POST', '/api/auth/refresh', 200)).toBe(false);
    expect(shouldInvalidateBadges('POST', '/api/notifications/read-all', 200)).toBe(false);
    expect(shouldInvalidateBadges('POST', '/api/authors', 200)).toBe(true); // không khớp nhầm tiền tố
  });
});

describe('BadgeCacheInvalidationMiddleware', () => {
  const make = (method: string, url: string, status: number) => {
    const badges = { clearBadgesCache: jest.fn() };
    const mw = new BadgeCacheInvalidationMiddleware(badges as any);
    let onFinish!: () => void;
    const res: any = { statusCode: status, on: jest.fn((_e: string, cb: () => void) => (onFinish = cb)) };
    const next = jest.fn();
    mw.use({ method, originalUrl: url } as any, res, next);
    return { badges, next, finish: () => onFinish() };
  };

  it('gọi next ngay; chỉ xoá cache khi response finish', () => {
    const { badges, next, finish } = make('PATCH', '/api/periodic-tasks/3', 200);
    expect(next).toHaveBeenCalled();
    expect(badges.clearBadgesCache).not.toHaveBeenCalled();
    finish();
    expect(badges.clearBadgesCache).toHaveBeenCalledTimes(1);
  });
  it('GET: không xoá', () => {
    const { badges, finish } = make('GET', '/api/sidebar/poll', 200);
    finish();
    expect(badges.clearBadgesCache).not.toHaveBeenCalled();
  });
});
