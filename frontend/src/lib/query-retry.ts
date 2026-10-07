/**
 * [PLAN CPU Mục 10B] Quy tắc retry mặc định của React Query: lỗi 4xx (403 thiếu quyền, 404, 409, 401...) KHÔNG thử lại
 * (thử lại không bao giờ đổi kết quả mà tốn thêm 2 invocation); lỗi mạng/5xx thử lại đúng 1 lần.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return false;
    return failureCount < 1;
}
