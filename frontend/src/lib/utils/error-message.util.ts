/**
 * Lấy message lỗi từ axios error 1 cách an toàn kiểu (type-safe), không dùng
 * `any` (dự án bật `@typescript-eslint/no-explicit-any` là ERROR - chặn hẳn
 * `next build`, không chỉ warning - đã có bài học thật từ lần dùng `catch (e:
 * any)` trước đây làm build Vercel fail).
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
    if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: unknown }).response === 'object'
    ) {
        const response = (err as { response?: { data?: { message?: string } } }).response;
        if (response?.data?.message) return response.data.message;
    }
    return fallback;
}