import { describe, it, expect } from 'vitest';
import { apiPathOf, isSilentPermissionDenied } from './permission-denied';

describe('apiPathOf', () => {
    it('bỏ origin, /api và query', () => {
        expect(apiPathOf('https://x.com/api/utms/managed-by-me?x=1')).toBe('/utms/managed-by-me');
        expect(apiPathOf('/link-groups/managed-by-me')).toBe('/link-groups/managed-by-me');
        expect(apiPathOf(undefined)).toBe('');
    });
});

describe('isSilentPermissionDenied', () => {
    it.each([
        '/link-groups/managed-by-me',
        '/link-groups/customer-counts',
        '/link-groups',
        '/utms/managed-by-me',
        '/utms/customer-counts',
        '/fanpages',
        '/fanpages/overview',
        '/fanpage-platforms',
        '/fanpage-health-statuses',
    ])('403 + GET %s -> im lặng', (u) => expect(isSilentPermissionDenied(403, 'get', u)).toBe(true));

    it('mặc định method rỗng coi là GET; hỗ trợ hoa/thường', () => {
        expect(isSilentPermissionDenied(403, undefined, '/utms')).toBe(true);
        expect(isSilentPermissionDenied(403, 'GET', '/utms')).toBe(true);
    });
    it('hành động chủ động (POST/PUT/PATCH/DELETE) vẫn toast', () => {
        for (const m of ['post', 'put', 'patch', 'delete']) expect(isSilentPermissionDenied(403, m, '/utms/1')).toBe(false);
    });
    it('status khác 403 hoặc module khác -> vẫn toast', () => {
        expect(isSilentPermissionDenied(500, 'get', '/utms')).toBe(false);
        expect(isSilentPermissionDenied(403, 'get', '/customers')).toBe(false);
        expect(isSilentPermissionDenied(403, 'get', '/utmsx')).toBe(false);
        expect(isSilentPermissionDenied(403, 'get', '/fanpagesfoo')).toBe(false);
    });
});
