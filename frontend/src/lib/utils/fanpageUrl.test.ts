import { describe, expect, it } from 'vitest';
import { detectPlatformByUrl, normalizeHost } from './fanpageUrl';

const platforms = [
    { id: 1, urlDomains: 'facebook.com,fb.com' },
    { id: 2, urlDomains: 'tiktok.com' },
    { id: 3, urlDomains: null },
];

describe('detectPlatformByUrl', () => {
    it('khớp đúng domain và subdomain (bỏ www/m)', () => {
        expect(detectPlatformByUrl('https://www.facebook.com/ten-page', platforms)).toBe(1);
        expect(detectPlatformByUrl('https://m.facebook.com/ten-page', platforms)).toBe(1);
        expect(detectPlatformByUrl('https://business.facebook.com/x', platforms)).toBe(1);
        expect(detectPlatformByUrl('https://fb.com/x', platforms)).toBe(1);
        expect(detectPlatformByUrl('https://www.tiktok.com/@abc', platforms)).toBe(2);
    });
    it('không khớp / URL hỏng / chưa khai domain -> null', () => {
        expect(detectPlatformByUrl('https://example.com/x', platforms)).toBeNull();
        expect(detectPlatformByUrl('khong-phai-url', platforms)).toBeNull();
        expect(detectPlatformByUrl('https://facebook.com', [{ id: 3, urlDomains: null }])).toBeNull();
    });
    it('không khớp đuôi giả (notfacebook.com)', () => {
        expect(detectPlatformByUrl('https://notfacebook.com/x', platforms)).toBeNull();
    });
    it('mơ hồ (2 nền tảng cùng domain) -> null', () => {
        expect(
            detectPlatformByUrl('https://facebook.com/x', [
                { id: 1, urlDomains: 'facebook.com' },
                { id: 4, urlDomains: 'facebook.com' },
            ]),
        ).toBeNull();
    });
});

describe('normalizeHost', () => {
    it('chữ thường + bỏ tiền tố', () => {
        expect(normalizeHost('WWW.Facebook.COM')).toBe('facebook.com');
    });
});
