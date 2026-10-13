import {
  isVnWorkingHours,
  keepAliveSkipReason,
  resetKeepAliveGate,
  respondKeepAliveSkipped,
} from './keepalive-gate.util';

// Mốc VN (UTC+7): T2 12/10/2026
const MON_0844 = Date.UTC(2026, 9, 12, 1, 44);
const MON_0845 = Date.UTC(2026, 9, 12, 1, 45);
const MON_1000 = Date.UTC(2026, 9, 12, 3, 0);
const MON_1844 = Date.UTC(2026, 9, 12, 11, 44);
const MON_1845 = Date.UTC(2026, 9, 12, 11, 45);
const SAT_1000 = Date.UTC(2026, 9, 10, 3, 0);
const head = { url: '/api/keep-alive', method: 'HEAD' };

describe('keepalive-gate.util', () => {
  beforeEach(() => resetKeepAliveGate());

  it('khung giờ 08:45–18:45 T2–T6 (giờ VN), nửa mở [start, end)', () => {
    expect(isVnWorkingHours(MON_0844)).toBe(false);
    expect(isVnWorkingHours(MON_0845)).toBe(true);
    expect(isVnWorkingHours(MON_1844)).toBe(true);
    expect(isVnWorkingHours(MON_1845)).toBe(false);
    expect(isVnWorkingHours(SAT_1000)).toBe(false);
  });

  it('ngoài giờ → off-hours; path khác (cron, người dùng) không bị đụng', () => {
    expect(keepAliveSkipReason(head, MON_0844, {})).toBe('off-hours');
    expect(keepAliveSkipReason({ url: '/api/zk-device-cron/sync-today', method: 'GET' }, MON_0844, {})).toBeNull();
    expect(keepAliveSkipReason({ url: '/api/customers', method: 'GET' }, SAT_1000, {})).toBeNull();
  });

  it('trong giờ: HEAD thứ 2 trong 30s bị chặn, sau 30s qua được', () => {
    expect(keepAliveSkipReason(head, MON_1000, {})).toBeNull();
    expect(keepAliveSkipReason(head, MON_1000 + 3_000, {})).toBe('duplicate');
    expect(keepAliveSkipReason(head, MON_1000 + 29_999, {})).toBe('duplicate');
    expect(keepAliveSkipReason(head, MON_1000 + 30_000, {})).toBeNull();
  });

  it('ping bị chặn KHÔNG làm mới mốc (không kéo dài cửa sổ chặn)', () => {
    keepAliveSkipReason(head, MON_1000, {});
    keepAliveSkipReason(head, MON_1000 + 20_000, {});
    expect(keepAliveSkipReason(head, MON_1000 + 30_000, {})).toBeNull();
  });

  it('GET thủ công không bị chặn trùng và không ghi mốc', () => {
    const get = { url: '/api/keep-alive?x=1', method: 'GET' };
    expect(keepAliveSkipReason(get, MON_1000, {})).toBeNull();
    expect(keepAliveSkipReason(get, MON_1000 + 1_000, {})).toBeNull();
    expect(keepAliveSkipReason(head, MON_1000 + 2_000, {})).toBeNull();
  });

  it('tắt bằng env', () => {
    expect(keepAliveSkipReason(head, MON_0844, { KEEPALIVE_HOURS_SKIP: 'false' })).toBeNull();
    expect(keepAliveSkipReason(head, MON_1000, { KEEPALIVE_DEDUPE: 'false' })).toBeNull();
    expect(keepAliveSkipReason(head, MON_1000 + 1_000, { KEEPALIVE_DEDUPE: 'false' })).toBeNull();
  });

  it('respond: 200, HEAD không body, GET trả JSON kèm lý do', () => {
    const mk = () => {
      const r = { statusCode: 0, body: undefined as string | undefined };
      return { r, res: { get statusCode() { return r.statusCode; }, set statusCode(v: number) { r.statusCode = v; }, setHeader: () => undefined, end: (b?: string) => { r.body = b; } } };
    };
    const h = mk();
    respondKeepAliveSkipped({ method: 'HEAD' }, h.res, 'duplicate');
    expect(h.r.statusCode).toBe(200);
    expect(h.r.body).toBeUndefined();
    const g = mk();
    respondKeepAliveSkipped({ method: 'GET' }, g.res, 'off-hours');
    expect(JSON.parse(g.r.body as string)).toEqual({ status: 'skipped', reason: 'off-hours' });
  });
});
