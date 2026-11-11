import { detectPlatformByUrl, normalizeHost, normalizePostUrl, normalizeUrlDomains, postUrlKey } from './fanpage-url.helper';

describe('normalizePostUrl', () => {
    it('hạ chữ thường host, bỏ www., bỏ # và / cuối', () => {
        expect(normalizePostUrl(' HTTPS://WWW.Facebook.com/Page/posts/123/#comments ')).toBe('https://facebook.com/Page/posts/123');
    });
    it('GIỮ nguyên hoa/thường của path (ID bài có thể phân biệt)', () => {
        expect(normalizePostUrl('https://x.com/AbC/status/1')).toBe('https://x.com/AbC/status/1');
    });
    it('bỏ tham số theo dõi, giữ tham số định danh bài', () => {
        expect(normalizePostUrl('https://facebook.com/permalink.php?story_fbid=9&id=1&fbclid=AAA&mibextid=xyz&utm_source=a')).toBe(
            'https://facebook.com/permalink.php?id=1&story_fbid=9',
        );
    });
    it('YouTube: giữ v=, bỏ si/feature', () => {
        expect(normalizePostUrl('https://www.youtube.com/watch?v=abc&si=zzz&feature=share')).toBe('https://youtube.com/watch?v=abc');
    });
    it('sắp xếp tham số -> thứ tự khác nhau vẫn cùng kết quả', () => {
        expect(normalizePostUrl('https://a.com/p?b=2&a=1')).toBe(normalizePostUrl('https://a.com/p?a=1&b=2'));
    });
    it('m.facebook.com và facebook.com cùng chuẩn hoá', () => {
        expect(normalizePostUrl('https://m.facebook.com/p/1')).toBe('https://facebook.com/p/1');
    });
    it('giữ port khác mặc định', () => {
        expect(normalizePostUrl('http://Example.com:8080/a/')).toBe('http://example.com:8080/a');
    });
    it('chuỗi không phải URL -> trả bản trim, không ném lỗi', () => {
        expect(normalizePostUrl('  không-phải-url// ')).toBe('không-phải-url');
    });
    it('idempotent', () => {
        const once = normalizePostUrl('https://WWW.tiktok.com/@u/video/1?is_from_webapp=1&x=2#f');
        expect(normalizePostUrl(once)).toBe(once);
    });
});

describe('postUrlKey', () => {
    it('http và https cùng khoá', () => {
        expect(postUrlKey('http://fb.com/p/1')).toBe(postUrlKey('https://www.fb.com/p/1/?fbclid=1'));
    });
    it('bài khác nhau -> khoá khác nhau', () => {
        expect(postUrlKey('https://fb.com/p/1')).not.toBe(postUrlKey('https://fb.com/p/2'));
    });
});

describe('normalizeHost', () => {
    it.each([
        ['WWW.Facebook.com', 'facebook.com'],
        ['m.facebook.com', 'facebook.com'],
        ['vt.tiktok.com', 'vt.tiktok.com'],
    ])('%s -> %s', (a, b) => expect(normalizeHost(a)).toBe(b));
});

describe('normalizeUrlDomains', () => {
    it('trim, hạ chữ thường, bỏ trùng/rỗng/giao thức/đường dẫn', () => {
        expect(normalizeUrlDomains(' Facebook.com, https://www.fb.com/x ,,facebook.com')).toBe('facebook.com,fb.com');
    });
    it('rỗng/null -> null', () => {
        expect(normalizeUrlDomains('  , ')).toBeNull();
        expect(normalizeUrlDomains(null)).toBeNull();
        expect(normalizeUrlDomains(undefined)).toBeNull();
    });
});

describe('detectPlatformByUrl', () => {
    const platforms = [
        { id: 1, urlDomains: 'facebook.com,fb.com' },
        { id: 2, urlDomains: 'tiktok.com' },
        { id: 3, urlDomains: null },
    ];
    it('khớp domain và subdomain', () => {
        expect(detectPlatformByUrl('https://www.facebook.com/abc', platforms)).toBe(1);
        expect(detectPlatformByUrl('https://fb.com/abc', platforms)).toBe(1);
        expect(detectPlatformByUrl('https://vt.tiktok.com/xyz', platforms)).toBe(2);
    });
    it('không khớp "đuôi chuỗi" giả (notfacebook.com)', () => {
        expect(detectPlatformByUrl('https://notfacebook.com/a', platforms)).toBeNull();
    });
    it('không có domain nào khớp / nền tảng không khai domain -> null', () => {
        expect(detectPlatformByUrl('https://zalo.me/a', platforms)).toBeNull();
    });
    it('mơ hồ (2 nền tảng cùng khớp) -> null, không đoán bừa', () => {
        expect(detectPlatformByUrl('https://facebook.com/a', [...platforms, { id: 9, urlDomains: 'facebook.com' }])).toBeNull();
    });
    it('URL hỏng -> null', () => {
        expect(detectPlatformByUrl('khong phai url', platforms)).toBeNull();
    });
});