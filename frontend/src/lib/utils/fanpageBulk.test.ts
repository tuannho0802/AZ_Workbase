import { describe, expect, it } from 'vitest';
import { buildBulkPreview, isAcceptablePostUrl, postUrlKey } from './fanpageBulk';

describe('fanpageBulk', () => {
    it('postUrlKey bỏ www/m., fbclid, #, / cuối, http/https', () => {
        expect(postUrlKey('http://m.facebook.com/p/1/?fbclid=zz#c')).toBe(postUrlKey('https://facebook.com/p/1'));
    });
    it('isAcceptablePostUrl từ chối chuỗi lạ / giao thức lạ / host không có TLD', () => {
        expect(isAcceptablePostUrl('abc')).toBe(false);
        expect(isAcceptablePostUrl('ftp://a.com/x')).toBe(false);
        expect(isAcceptablePostUrl('https://localhost/x')).toBe(false);
        expect(isAcceptablePostUrl('https://a.com/x')).toBe(true);
    });
    it('buildBulkPreview: bỏ dòng trống, giữ số dòng, đánh dấu sai / trùng lô / trùng bài đã có', () => {
        const rows = buildBulkPreview(
            ['https://a.com/1', '', 'oops', 'https://a.com/1/?utm_source=x', 'https://a.com/exists'].join('\n'),
            [{ id: 1, url: 'https://www.a.com/exists', postedDate: '2026-11-01' }],
        );
        expect(rows.map((r) => [r.line, r.status])).toEqual([
            [1, 'valid'],
            [3, 'invalid'],
            [4, 'duplicate_in_batch'],
            [5, 'duplicate_existing'],
        ]);
        expect(rows[3].existingPostedDate).toBe('2026-11-01');
    });
});
