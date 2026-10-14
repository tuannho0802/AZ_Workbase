import { getClientIp, getDirectClientIp, normalizeIp } from './client-ip';

describe('client-ip (P3.2)', () => {
    it('normalizeIp: bỏ tiền tố ::ffff:, chuẩn hoá chữ thường, từ chối rác', () => {
        expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
        expect(normalizeIp('  2001:DB8::1 ')).toBe('2001:db8::1');
        expect(normalizeIp('')).toBeNull();
        expect(normalizeIp(undefined)).toBeNull();
        expect(normalizeIp('1.2.3.4; DROP TABLE')).toBeNull();
        expect(normalizeIp('a'.repeat(46))).toBeNull();
    });

    it('getClientIp: ưu tiên header x-az-client-ip, fallback req.ip', () => {
        expect(getClientIp({ headers: { 'x-az-client-ip': '9.9.9.9' }, ip: '1.1.1.1' })).toBe('9.9.9.9');
        expect(getClientIp({ headers: {}, ip: '::ffff:1.1.1.1' })).toBe('1.1.1.1');
        expect(getClientIp({ headers: { 'x-az-client-ip': '  ' }, ip: '1.1.1.1' })).toBe('1.1.1.1');
    });

    it('getDirectClientIp: CHỈ req.ip, bỏ qua header do client tự gắn', () => {
        expect(getDirectClientIp({ headers: { 'x-az-client-ip': '9.9.9.9' }, ip: '1.1.1.1' })).toBe('1.1.1.1');
        expect(getDirectClientIp({ headers: {} })).toBeNull();
    });
});