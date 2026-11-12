import { isAcceptablePostUrl, planBulkPosts, POST_URL_MAX_LENGTH } from './fanpage-bulk-posts.helper';

describe('isAcceptablePostUrl', () => {
    it('nhận http/https có tên miền', () => {
        expect(isAcceptablePostUrl('https://facebook.com/page/posts/1')).toBe(true);
        expect(isAcceptablePostUrl('http://tiktok.com/@a/video/2')).toBe(true);
    });
    it('từ chối chuỗi không phải URL, giao thức lạ, host không có TLD', () => {
        expect(isAcceptablePostUrl('khong-phai-url')).toBe(false);
        expect(isAcceptablePostUrl('ftp://a.com/x')).toBe(false);
        expect(isAcceptablePostUrl('javascript:alert(1)')).toBe(false);
        expect(isAcceptablePostUrl('https://localhost/x')).toBe(false);
    });
});

describe('planBulkPosts', () => {
    it('link hợp lệ -> valid, giữ nguyên thứ tự dòng', () => {
        const r = planBulkPosts(['https://a.com/p/1', 'https://a.com/p/2'], []);
        expect(r.valid.map((v) => v.url)).toEqual(['https://a.com/p/1', 'https://a.com/p/2']);
        expect(r.skipped).toEqual([]);
    });

    it('trim khoảng trắng; dòng rỗng / không phải URL -> invalid_url', () => {
        const r = planBulkPosts(['  https://a.com/p/1  ', '', '   ', 'abc'], []);
        expect(r.valid.map((v) => v.url)).toEqual(['https://a.com/p/1']);
        expect(r.skipped.map((s) => s.reason)).toEqual(['invalid_url', 'invalid_url', 'invalid_url']);
    });

    it('link dài quá 500 ký tự -> too_long (không tràn cột varchar(500))', () => {
        const long = 'https://a.com/' + 'x'.repeat(POST_URL_MAX_LENGTH);
        const r = planBulkPosts([long], []);
        expect(r.valid).toEqual([]);
        expect(r.skipped).toEqual([{ url: long, reason: 'too_long' }]);
    });

    it('trùng bài đã có trong Page -> duplicate_existing kèm id + ngày (so theo khoá chuẩn hoá)', () => {
        const existing = [{ id: 7, url: 'https://facebook.com/p/1', postedDate: '2026-11-01' }];
        const r = planBulkPosts(['https://www.facebook.com/p/1/?fbclid=AAA#x'], existing);
        expect(r.valid).toEqual([]);
        expect(r.skipped).toEqual([
            { url: 'https://www.facebook.com/p/1/?fbclid=AAA#x', reason: 'duplicate_existing', existingPostId: 7, existingPostedDate: '2026-11-01' },
        ]);
    });

    it('http và https cùng 1 bài -> coi là trùng', () => {
        const r = planBulkPosts(['http://a.com/p/1'], [{ id: 1, url: 'https://a.com/p/1', postedDate: null }]);
        expect(r.skipped[0]).toMatchObject({ reason: 'duplicate_existing', existingPostId: 1, existingPostedDate: null });
    });

    it('dữ liệu cũ đã trùng sẵn -> báo bài CŨ NHẤT (id nhỏ nhất)', () => {
        const existing = [
            { id: 9, url: 'https://a.com/p/1/', postedDate: '2026-11-05' },
            { id: 3, url: 'https://a.com/p/1', postedDate: '2026-11-02' },
        ];
        const r = planBulkPosts(['https://a.com/p/1'], existing);
        expect(r.skipped[0]).toMatchObject({ existingPostId: 3, existingPostedDate: '2026-11-02' });
    });

    it('trùng nhau TRONG lô -> dòng đầu tạo, dòng sau duplicate_in_batch', () => {
        const r = planBulkPosts(['https://a.com/p/1', 'https://a.com/p/1/?utm_source=x', 'https://a.com/p/2'], []);
        expect(r.valid.map((v) => v.url)).toEqual(['https://a.com/p/1', 'https://a.com/p/2']);
        expect(r.skipped).toEqual([{ url: 'https://a.com/p/1/?utm_source=x', reason: 'duplicate_in_batch' }]);
    });

    it('lô trộn: hợp lệ + hỏng + trùng -> mỗi dòng đúng 1 kết cục, tổng = số dòng', () => {
        const urls = ['https://a.com/1', 'oops', 'https://a.com/2', 'https://a.com/1', 'https://a.com/exists'];
        const r = planBulkPosts(urls, [{ id: 1, url: 'https://a.com/exists', postedDate: null }]);
        expect(r.valid.length + r.skipped.length).toBe(urls.length);
        expect(r.valid.map((v) => v.url)).toEqual(['https://a.com/1', 'https://a.com/2']);
        expect(r.skipped.map((s) => s.reason)).toEqual(['invalid_url', 'duplicate_in_batch', 'duplicate_existing']);
    });
});