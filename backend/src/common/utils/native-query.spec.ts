import { installNativeQuery } from './native-query';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const legacyUrl = require('url') as { parse: (u: string, q: boolean) => { query: unknown } };

describe('installNativeQuery', () => {
    const cases = [
        '/api/x',
        '/api/x?',
        '/api/x?page=1&limit=20',
        '/api/x?search=nguy%E1%BB%85n+v%C4%83n&status=a',
        '/api/x?a=1&a=2&a=3',
        '/api/x?empty=&flag&x=1=2',
        '/api/x?dateFrom=2026-10-01&dateTo=2026-10-08&ids=1,2,3',
    ];

    it.each(cases)('cho kết quả giống hệt url.parse(url, true).query: %s', (url) => {
        const req: { url: string; query?: unknown } = { url };
        installNativeQuery(req);
        expect(req.query).toEqual(legacyUrl.parse(url, true).query);
    });

    it('nhớ kết quả (cùng 1 object ở lần đọc sau) và cho phép gán lại', () => {
        const req: { url: string; query?: unknown } = { url: '/a?x=1' };
        installNativeQuery(req);
        const first = req.query;
        expect(req.query).toBe(first);
        req.query = { y: '2' };
        expect(req.query).toEqual({ y: '2' });
    });

    it('thay được getter cấu hình được của Vercel và không gọi url.parse', () => {
        const spy = jest.spyOn(legacyUrl, 'parse');
        const req: { url: string; query?: unknown } = { url: '/a?x=1' };
        Object.defineProperty(req, 'query', { configurable: true, get: () => legacyUrl.parse(req.url, true).query });
        spy.mockClear();
        installNativeQuery(req);
        expect(req.query).toEqual({ x: '1' });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('không throw khi thuộc tính không cấu hình được (giữ hành vi cũ)', () => {
        const req: { url: string } = { url: '/a?x=1' };
        Object.defineProperty(req, 'query', { value: { keep: true }, configurable: false });
        expect(() => installNativeQuery(req)).not.toThrow();
        expect((req as unknown as { query: unknown }).query).toEqual({ keep: true });
    });
});
