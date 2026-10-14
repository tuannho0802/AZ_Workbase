/**
 * Lấy IP client — PLAN_RETENTION_SECURITY_ROADMAP P3.2. Dùng chung cho throttler và khoá đăng nhập theo IP.
 *
 * Có 2 hàm vì 2 đường gọi khác nhau (xem throttler-behind-proxy.guard.ts):
 * - `getClientIp(req)`: ƯU TIÊN header `x-az-client-ip` (route trung gian ở FE như `register/route.ts` tự gắn, vì
 *   `X-Forwarded-For` ở BE khi đó chỉ là IP hạ tầng FE), fallback `req.ip`.
 * - `getDirectClientIp(req)`: CHỈ `req.ip` (đã qua `trust proxy: 1`, Vercel edge tự ghi đè X-Forwarded-For nên không
 *   giả mạo được). Dùng cho `/auth/login` — trình duyệt gọi THẲNG BE (đã xác minh: FE `auth.api.ts` -> axios tới
 *   `NEXT_PUBLIC_API_URL`, không có route trung gian). Header `x-az-client-ip` do client TỰ GẮN nên nếu tin nó ở
 *   login thì kẻ tấn công đổi giá trị header mỗi request để né khoá IP.
 */

type ReqLike = { headers?: Record<string, unknown>; ip?: string };

/** Bỏ tiền tố IPv4-mapped (`::ffff:1.2.3.4`), cắt khoảng trắng, giới hạn 45 ký tự (độ dài tối đa của IPv6 dạng chữ). */
export function normalizeIp(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    let ip = raw.trim();
    if (!ip) return null;
    if (ip.toLowerCase().startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
    if (ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
    return ip.toLowerCase();
}

export function getClientIp(req: ReqLike): string | null {
    const forwarded = req.headers?.['x-az-client-ip'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return normalizeIp(forwarded) ?? forwarded.trim();
    }
    return normalizeIp(req.ip);
}

export function getDirectClientIp(req: ReqLike): string | null {
    return normalizeIp(req.ip);
}