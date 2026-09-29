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

/**
 * Interceptor axios (`axios-instance.ts`) ĐÃ tự toast mọi lỗi HTTP có response (trừ 401). Nếu `onError` của
 * mutation lại `message.error(...)` nữa thì người dùng thấy 2 toast y hệt nhau. Hàm này cho biết lỗi đó
 * đã được toast toàn cục chưa.
 */
export function hasGlobalErrorToast(err: unknown): boolean {
    if (typeof err !== 'object' || err === null || !('response' in err)) return false;
    const response = (err as { response?: { status?: number } | null }).response;
    if (typeof response !== 'object' || response === null) return false;
    return response.status !== 401;
}

/** Toast lỗi ở tầng component CHỈ khi interceptor chưa toast (vd lỗi mạng/timeout không có response). */
export function toastApiError(
    message: { error: (content: string) => unknown },
    err: unknown,
    fallback: string,
): void {
    if (hasGlobalErrorToast(err)) return;
    message.error(getApiErrorMessage(err, fallback));
}
