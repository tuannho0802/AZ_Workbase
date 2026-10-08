import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { CacheControlInterceptor, REF_DATA_HTTP_MAX_AGE_S, refDataCache } from './cache-control.interceptor';

function run(interceptor: CacheControlInterceptor, method = 'GET') {
  const setHeader = jest.fn();
  const ctx = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }), getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of('ok') };
  interceptor.intercept(ctx, next).subscribe();
  return setHeader;
}

describe('CacheControlInterceptor', () => {
  it('refDataCache(): private, max-age=1800 (không public, không stale-while-revalidate)', () => {
    const h = run(refDataCache());
    expect(h).toHaveBeenCalledWith('Cache-Control', `private, max-age=${REF_DATA_HTTP_MAX_AGE_S}`);
    expect(REF_DATA_HTTP_MAX_AGE_S).toBe(1800);
  });

  it('chế độ cũ revalidate=true vẫn là private, no-cache', () => {
    expect(run(new CacheControlInterceptor(60, true))).toHaveBeenCalledWith('Cache-Control', 'private, no-cache');
  });

  it('chế độ cũ mặc định vẫn là public + stale-while-revalidate', () => {
    expect(run(new CacheControlInterceptor(60))).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  });

  it('không set header với method khác GET', () => {
    expect(run(refDataCache(), 'POST')).not.toHaveBeenCalled();
  });
});
