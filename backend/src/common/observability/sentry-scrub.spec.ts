import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent, scrubText, stripQuery } from './sentry-scrub';

describe('sentry-scrub (PLAN_HARDENING P5)', () => {
  describe('scrubText', () => {
    it('che SĐT Việt Nam (0xxx và +84xxx)', () => {
      expect(scrubText("Duplicate entry '0901234567' for key 'uk_phone'")).not.toContain('0901234567');
      expect(scrubText('call +84901234567 now')).not.toContain('901234567');
      expect(scrubText('call 84901234567 now')).not.toContain('901234567');
    });

    it('che email', () => {
      expect(scrubText('user a.b+c@example.com failed')).toBe('user [Filtered] failed');
    });

    it('che Bearer token và JWT', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123_-xyz';
      expect(scrubText(`Authorization: Bearer ${jwt}`)).not.toContain('eyJ');
      expect(scrubText(`token=${jwt}`)).not.toContain('eyJ');
    });

    it('không đụng vào dãy số không phải SĐT (id, 12+ chữ số liền)', () => {
      expect(scrubText('customer id 12345')).toBe('customer id 12345');
      expect(scrubText('order 0901234567890')).toContain('0901234567890');
    });
  });

  describe('stripQuery', () => {
    it('bỏ query string và hash', () => {
      expect(stripQuery('https://x.com/api/customers?search=0901234567&page=1')).toBe(
        'https://x.com/api/customers',
      );
      expect(stripQuery('/a/b#frag')).toBe('/a/b');
      expect(stripQuery('/a/b')).toBe('/a/b');
    });
  });

  describe('scrubEvent', () => {
    const build = (): ErrorEvent =>
      ({
        type: undefined,
        message: 'Lỗi với khách 0912345678',
        request: {
          method: 'POST',
          url: 'https://api.x.com/api/customers?search=Nguyen',
          headers: { Authorization: 'Bearer secret', Cookie: 'a=b' },
          cookies: { a: 'b' },
          data: { name: 'Nguyen Van A', phone: '0912345678' },
          query_string: 'search=Nguyen',
        },
        user: { id: '5', email: 'a@b.com', ip_address: '1.2.3.4' },
        extra: { body: { phone: '0912345678' } },
        exception: { values: [{ type: 'Error', value: 'dup a@b.com' }] },
        breadcrumbs: [
          { message: 'call 0912345678', data: { url: '/api/x?q=1', body: 'secret' } },
        ],
      }) as ErrorEvent;

    it('xoá header/cookie/body/query và chỉ giữ method + url đã bỏ query', () => {
      const out = scrubEvent(build());
      expect(out.request).toEqual({
        method: 'POST',
        url: 'https://api.x.com/api/customers',
      });
    });

    it('xoá user và extra', () => {
      const out = scrubEvent(build());
      expect(out.user).toBeUndefined();
      expect(out.extra).toBeUndefined();
    });

    it('che PII trong message, exception và breadcrumbs', () => {
      const out = scrubEvent(build());
      expect(JSON.stringify(out)).not.toMatch(/0912345678|a@b\.com|secret|Nguyen/);
      expect(out.breadcrumbs?.[0].data).toEqual({ url: '/api/x' });
    });

    it('không lỗi khi event thiếu các trường tuỳ chọn', () => {
      expect(() => scrubEvent({} as ErrorEvent)).not.toThrow();
    });
  });
});
