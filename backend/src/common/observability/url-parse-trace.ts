/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12H] Truy nguồn cảnh báo `[DEP0169] url.parse()` (Node 24 trên Vercel).
 *
 * Mặc định TẮT (không đổi hành vi, không tốn CPU). Bật tạm bằng env `TRACE_URL_PARSE=true` trên Vercel:
 * mỗi call-site KHÁC NHAU của `url.parse()` chỉ log đúng 1 lần (`Logger.warn`, 6 frame đầu của stack) rồi im.
 * Không log đối số (URL có thể chứa token/PII) - chỉ log kiểu + độ dài.
 *
 * ⚠️ PHẢI là import ĐẦU TIÊN của main.ts: một số thư viện (vd `parseurl`, dùng trong router của Express) chụp
 * `url.parse` ngay lúc được nạp (`var parse = url.parse`) nên vá sau đó sẽ không bắt được.
 */
import { Logger } from '@nestjs/common';

export function installUrlParseTrace(enabled: boolean = process.env.TRACE_URL_PARSE === 'true'): void {
    if (!enabled) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeUrl = require('url') as { parse: (...args: unknown[]) => unknown };
    const original = nodeUrl.parse;
    const logger = new Logger('UrlParseTrace');
    const seen = new Set<string>();

    nodeUrl.parse = function patchedParse(this: unknown, ...args: unknown[]) {
        const stack = (new Error().stack ?? '').split('\n').slice(2, 8).join('\n');
        if (!seen.has(stack)) {
            seen.add(stack);
            const arg = args[0];
            logger.warn(`url.parse() được gọi (arg: ${typeof arg}, length=${typeof arg === 'string' ? arg.length : 'n/a'})\n${stack}`);
        }
        return original.apply(this, args);
    };
}

installUrlParseTrace();
