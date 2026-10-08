import { Logger } from '@nestjs/common';
import { installUrlParseTrace } from './url-parse-trace';

describe('installUrlParseTrace', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeUrl = require('url') as { parse: (...a: unknown[]) => unknown };
    const original = nodeUrl.parse;

    afterEach(() => {
        nodeUrl.parse = original;
        jest.restoreAllMocks();
    });

    it('mặc định TẮT: không vá url.parse', () => {
        installUrlParseTrace(false);
        expect(nodeUrl.parse).toBe(original);
    });

    it('bật: trả đúng kết quả, log 1 lần cho mỗi call-site, không log nội dung URL', () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        installUrlParseTrace(true);
        const parse = () => nodeUrl.parse('https://example.com/a?token=SECRET') as { pathname: string };

        expect(parse().pathname).toBe('/a'); // call-site #1 (dòng này)
        expect(warn).toHaveBeenCalledTimes(1);

        for (let i = 0; i < 5; i++) parse(); // call-site #2 (vòng lặp) -> chỉ log 1 lần dù gọi 5 lần
        expect(warn).toHaveBeenCalledTimes(2);

        const msgs = warn.mock.calls.map((c) => String(c[0]));
        expect(msgs.every((m) => !m.includes('SECRET') && !m.includes('example.com'))).toBe(true);
    });
});
