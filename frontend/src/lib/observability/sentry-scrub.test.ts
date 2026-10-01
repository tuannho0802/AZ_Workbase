import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { SENTRY_IGNORE_ERRORS, scrubEvent, scrubText, stripQuery } from './sentry-scrub';

describe('sentry-scrub FE (PLAN_HARDENING P5)', () => {
  it('scrubText che SĐT, email, Bearer và JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123_-xyz';
    const out = scrubText(`0901234567 / +84912345678 / a@b.com / Bearer ${jwt} / ${jwt}`);
    expect(out).not.toMatch(/0901234567|912345678|a@b\.com|eyJ/);
  });

  it('không đụng dãy số không phải SĐT', () => {
    expect(scrubText('khách số 12345')).toBe('khách số 12345');
  });

  it('stripQuery bỏ query + hash', () => {
    expect(stripQuery('/customers?search=0901234567#x')).toBe('/customers');
    expect(stripQuery('/customers')).toBe('/customers');
  });

  it('scrubEvent xoá request/user/extra, che text, bỏ query ở breadcrumb', () => {
    const event = {
      message: 'lỗi khách 0912345678',
      request: {
        method: 'GET',
        url: 'https://azworkbase.com/customers?search=Nguyen',
        headers: { Cookie: 'azw-session=1' },
        cookies: { a: 'b' },
        data: { phone: '0912345678' },
      },
      user: { id: '5', email: 'a@b.com' },
      extra: { note: 'bí mật' },
      exception: { values: [{ type: 'Error', value: 'trùng a@b.com' }] },
      breadcrumbs: [
        { category: 'fetch', message: 'gọi 0912345678', data: { url: '/api/customers?search=0912345678', method: 'GET' } },
        { category: 'navigation', data: { from: '/a?x=1', to: '/b?phone=0912345678' } },
      ],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.request).toEqual({ method: 'GET', url: 'https://azworkbase.com/customers' });
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.breadcrumbs?.[0].data).toEqual({ url: '/api/customers' });
    expect(out.breadcrumbs?.[1].data).toEqual({ url: '/b' });
    expect(JSON.stringify(out)).not.toMatch(/0912345678|a@b\.com|Nguyen|bí mật|azw-session/);
  });

  it('scrubEvent không lỗi khi event rỗng', () => {
    expect(() => scrubEvent({} as ErrorEvent)).not.toThrow();
  });

  it('ignoreErrors bỏ axios 4xx nhưng giữ 5xx', () => {
    const matches = (msg: string) =>
      SENTRY_IGNORE_ERRORS.some((p) => (typeof p === 'string' ? msg.includes(p) : p.test(msg)));
    expect(matches('Request failed with status code 401')).toBe(true);
    expect(matches('Request failed with status code 422')).toBe(true);
    expect(matches('Request failed with status code 500')).toBe(false);
    expect(matches('ResizeObserver loop completed with undelivered notifications')).toBe(true);
  });
});
