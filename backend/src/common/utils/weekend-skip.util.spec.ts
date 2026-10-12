import { isVnWeekend, shouldSkipOnWeekend, respondWeekendSkipped } from './weekend-skip.util';

// Mốc UTC -> thứ theo giờ VN (UTC+7)
const FRI_VN_2330 = Date.UTC(2026, 9, 9, 16, 30); // Thứ 6 09/10/2026 23:30 VN
const SAT_VN_0010 = Date.UTC(2026, 9, 9, 17, 10); // Thứ 7 10/10/2026 00:10 VN
const SUN_VN_2330 = Date.UTC(2026, 9, 11, 16, 30); // CN 11/10/2026 23:30 VN
const MON_VN_0010 = Date.UTC(2026, 9, 11, 17, 10); // Thứ 2 12/10/2026 00:10 VN
const MON_VN_1000 = Date.UTC(2026, 9, 12, 3, 0); // Thứ 2 12/10/2026 10:00 VN

describe('weekend-skip.util', () => {
  it('isVnWeekend theo giờ VN, đúng ở ranh giới nửa đêm', () => {
    expect(isVnWeekend(FRI_VN_2330)).toBe(false);
    expect(isVnWeekend(SAT_VN_0010)).toBe(true);
    expect(isVnWeekend(SUN_VN_2330)).toBe(true);
    expect(isVnWeekend(MON_VN_0010)).toBe(false);
    expect(isVnWeekend(MON_VN_1000)).toBe(false);
  });

  it('chỉ bỏ qua đúng các path nền, kể cả có query', () => {
    expect(shouldSkipOnWeekend({ url: '/api/keep-alive' }, SAT_VN_0010, {})).toBe(true);
    expect(shouldSkipOnWeekend({ url: '/api/periodic-tasks-cron/auto-overdue?secret=x' }, SUN_VN_2330, {})).toBe(true);
    expect(shouldSkipOnWeekend({ url: '/api/customers' }, SAT_VN_0010, {})).toBe(false);
    expect(shouldSkipOnWeekend({ url: '/api/auth/refresh' }, SAT_VN_0010, {})).toBe(false);
    expect(shouldSkipOnWeekend({ url: '/iclock/cdata' }, SAT_VN_0010, {})).toBe(false);
  });

  it('ngày thường không bỏ qua', () => {
    expect(shouldSkipOnWeekend({ url: '/api/keep-alive' }, MON_VN_1000, {})).toBe(false);
  });

  it('WEEKEND_SKIP=false tắt hoàn toàn', () => {
    expect(shouldSkipOnWeekend({ url: '/api/keep-alive' }, SAT_VN_0010, { WEEKEND_SKIP: 'false' })).toBe(false);
  });

  it('respondWeekendSkipped: HEAD không body, GET trả JSON', () => {
    const mk = () => {
      const r = { statusCode: 0, headers: {} as Record<string, string>, body: undefined as string | undefined, ended: false };
      return {
        r,
        res: {
          get statusCode() { return r.statusCode; },
          set statusCode(v: number) { r.statusCode = v; },
          setHeader: (k: string, v: string) => { r.headers[k] = v; },
          end: (b?: string) => { r.body = b; r.ended = true; },
        },
      };
    };
    const head = mk();
    respondWeekendSkipped({ method: 'HEAD' }, head.res);
    expect(head.r.statusCode).toBe(200);
    expect(head.r.body).toBeUndefined();
    const get = mk();
    respondWeekendSkipped({ method: 'GET' }, get.res);
    expect(JSON.parse(get.r.body as string)).toEqual({ status: 'skipped', reason: 'weekend-vn' });
  });
});
