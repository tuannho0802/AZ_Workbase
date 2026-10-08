import { parse as parseQuerystring } from 'querystring';

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12H] Gỡ cảnh báo `[DEP0169] url.parse()` trên Vercel.
 *
 * Nguồn (đã truy bằng `TRACE_URL_PARSE`): helper của runtime Vercel (`/opt/rust/nodejs.js`) gắn `req.query`
 * là getter gọi `url.parse(req.url, true)`; mỗi lần Nest đọc `@Query()` là một lần `url.parse()` chạy.
 * Ta không sửa được code của Vercel, nên thay getter đó bằng `querystring.parse()` - đây CHÍNH là hàm
 * `url.parse(url, true)` dùng bên trong để dựng `query` (cùng object không prototype, cùng quy tắc mảng cho khoá lặp,
 * cùng giới hạn 1000 khoá) => kết quả giống hệt, chỉ bỏ phần phân tích URL thừa và cảnh báo.
 *
 * Lười + nhớ kết quả (đọc lần đầu mới parse, sau đó thành thuộc tính thường). Lỗi (vd thuộc tính không cấu hình
 * được) thì bỏ qua và giữ hành vi cũ của Vercel.
 */
export function installNativeQuery(req: { url?: string }): void {
    const settle = (value: unknown) =>
        Object.defineProperty(req, 'query', { value, writable: true, configurable: true, enumerable: true });
    try {
        Object.defineProperty(req, 'query', {
            configurable: true,
            enumerable: true,
            get() {
                const url = req.url ?? '';
                const i = url.indexOf('?');
                const search = i === -1 ? '' : url.slice(i + 1).split('#')[0];
                const parsed = parseQuerystring(search);
                settle(parsed);
                return parsed;
            },
            set(value: unknown) {
                settle(value);
            },
        });
    } catch {
        // giữ nguyên getter gốc của Vercel
    }
}
