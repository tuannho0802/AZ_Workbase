import {
  isPollWindowOpenVn,
  pollGateSkipReason,
  respondPollSkipped,
  POLL_GATE_PATHS,
} from './poll-gate.util';

// Mốc theo giờ VN (UTC+7). 2026-10-13 là Thứ 3.
const vn = (iso: string): number => new Date(`${iso}+07:00`).getTime();
const TUE_10 = vn('2026-10-13T10:00:00');
const TUE_1844 = vn('2026-10-13T18:44:59');
const TUE_1845 = vn('2026-10-13T18:45:00');
const TUE_0300 = vn('2026-10-13T03:00:00');
const FRI_2000 = vn('2026-10-16T20:00:00');
const SAT_10 = vn('2026-10-17T10:00:00');
const SUN_10 = vn('2026-10-18T10:00:00');
const MON_0001 = vn('2026-10-19T00:01:00');

describe('poll-gate.util', () => {
  describe('isPollWindowOpenVn (khớp FE poll-schedule)', () => {
    it('T2–T6 trước 18:45 = mở (kể cả sáng sớm, không có mốc bắt đầu)', () => {
      expect(isPollWindowOpenVn(TUE_10)).toBe(true);
      expect(isPollWindowOpenVn(TUE_1844)).toBe(true);
      expect(isPollWindowOpenVn(TUE_0300)).toBe(true);
      expect(isPollWindowOpenVn(MON_0001)).toBe(true);
    });
    it('từ 18:45 = đóng; T7/CN = đóng', () => {
      expect(isPollWindowOpenVn(TUE_1845)).toBe(false);
      expect(isPollWindowOpenVn(FRI_2000)).toBe(false);
      expect(isPollWindowOpenVn(SAT_10)).toBe(false);
      expect(isPollWindowOpenVn(SUN_10)).toBe(false);
    });
  });

  describe('pollGateSkipReason', () => {
    const get = (url: string) => ({ url, method: 'GET' });

    it('chặn cả 3 đường dẫn poll ngoài giờ (kể cả có query string)', () => {
      for (const p of POLL_GATE_PATHS) {
        expect(pollGateSkipReason(get(p), TUE_1845, {})).toBe('off-hours');
        expect(pollGateSkipReason(get(`${p}?t=1`), SAT_10, {})).toBe('off-hours');
      }
    });

    it('trong giờ làm việc: cho qua', () => {
      for (const p of POLL_GATE_PATHS) {
        expect(pollGateSkipReason(get(p), TUE_10, {})).toBeNull();
      }
    });

    it('KHÔNG chặn đường dẫn khác (danh sách thông báo, đánh dấu đã đọc, API nghiệp vụ)', () => {
      expect(pollGateSkipReason(get('/api/notifications'), SAT_10, {})).toBeNull();
      expect(pollGateSkipReason(get('/api/notifications/poll/extra'), SAT_10, {})).toBeNull();
      expect(pollGateSkipReason(get('/api/customers'), SAT_10, {})).toBeNull();
      expect(pollGateSkipReason({ url: '/api/notifications/5/read', method: 'PATCH' }, SAT_10, {})).toBeNull();
    });

    it('chỉ chặn GET (OPTIONS/POST/HEAD đi đường cũ)', () => {
      expect(pollGateSkipReason({ url: '/api/sidebar/poll', method: 'OPTIONS' }, SAT_10, {})).toBeNull();
      expect(pollGateSkipReason({ url: '/api/sidebar/poll', method: 'POST' }, SAT_10, {})).toBeNull();
      expect(pollGateSkipReason({ url: '/api/sidebar/poll', method: 'HEAD' }, SAT_10, {})).toBeNull();
    });

    it('POLL_HOURS_SKIP=false tắt cổng; giá trị khác (hoặc vắng) = vẫn BẬT', () => {
      expect(pollGateSkipReason(get('/api/sidebar/poll'), SAT_10, { POLL_HOURS_SKIP: 'false' })).toBeNull();
      expect(pollGateSkipReason(get('/api/sidebar/poll'), SAT_10, { POLL_HOURS_SKIP: 'true' })).toBe('off-hours');
      expect(pollGateSkipReason(get('/api/sidebar/poll'), SAT_10, {})).toBe('off-hours');
    });

    it('request không có url/method không làm crash', () => {
      expect(pollGateSkipReason({}, SAT_10, {})).toBeNull();
    });
  });

  describe('respondPollSkipped', () => {
    const makeRes = () => {
      const headers: Record<string, string> = {};
      let body: string | undefined;
      return {
        res: {
          statusCode: 0,
          setHeader: (k: string, v: string) => {
            headers[k] = v;
          },
          end: (b?: string) => {
            body = b;
          },
        },
        headers,
        getBody: () => body,
      };
    };
    const allowed = ['https://azworkbase.com', 'http://localhost:3000'];

    it('200 + JSON {skipped, reason} + no-store', () => {
      const { res, headers, getBody } = makeRes();
      respondPollSkipped({ headers: {} }, res, 'off-hours', allowed);
      expect(res.statusCode).toBe(200);
      expect(headers['Cache-Control']).toBe('no-store');
      expect(headers['Content-Type']).toContain('application/json');
      expect(JSON.parse(getBody() as string)).toEqual({ skipped: true, reason: 'off-hours' });
    });

    it('origin hợp lệ: gắn CORS (browser cross-origin mới đọc được response)', () => {
      const { res, headers } = makeRes();
      respondPollSkipped({ headers: { origin: 'https://azworkbase.com' } }, res, 'off-hours', allowed);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://azworkbase.com');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
      expect(headers['Vary']).toBe('Origin');
    });

    it('origin lạ / không có origin: KHÔNG gắn Allow-Origin (giống enableCors)', () => {
      const a = makeRes();
      respondPollSkipped({ headers: { origin: 'https://evil.example' } }, a.res, 'off-hours', allowed);
      expect(a.headers['Access-Control-Allow-Origin']).toBeUndefined();
      const b = makeRes();
      respondPollSkipped({}, b.res, 'off-hours', allowed);
      expect(b.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });
});
