/**
 * Logic THUẦN cho Markdown của Hướng dẫn (tách khỏi React để test được).
 *
 * Nội dung guide do người dùng nhập -> nguồn XSS (token nằm trong storage trình duyệt). Quy tắc:
 *  - KHÔNG bật HTML thô (không dùng rehype-raw): `<script>`, `<img onerror>`... bị hiện thành chữ.
 *  - URL chỉ cho qua giao thức http/https/mailto/tel, đường dẫn tương đối `/...`, `#...`, `?...`.
 *    `javascript:`, `data:`, `vbscript:` ... bị loại (kể cả khi chèn tab/xuống dòng/ký tự điều khiển để lách).
 *  - Ảnh chỉ nhận https:// (luồng ảnh/đính kèm B2 presign sẵn có) - không nhận `data:` hay http thường.
 */

/** Ngôn ngữ của khối code dùng để nhúng mẫu minh hoạ: ```az-demo\nstatus-tags\n``` */
export const DEMO_FENCE_LANG = 'az-demo';

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Bỏ ký tự điều khiển / khoảng trắng mà trình duyệt bỏ qua khi phân tích giao thức (`java\tscript:`). */
function stripUrlNoise(url: string): string {
    // eslint-disable-next-line no-control-regex
    return url.replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '');
}

/** Trả URL an toàn cho liên kết, hoặc '' nếu không an toàn. */
export function sanitizeLinkUrl(raw: string | null | undefined): string {
    if (!raw) return '';
    const url = raw.trim();
    const compact = stripUrlNoise(url);
    if (!compact) return '';
    // Đường dẫn tương đối nội bộ / neo / query. `//host` (protocol-relative) và `/\host` bị chặn.
    if (compact.startsWith('#') || compact.startsWith('?')) return url;
    if (compact.startsWith('/')) {
        return compact.startsWith('//') || compact.startsWith('/\\') ? '' : url;
    }
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(compact);
    if (!match) {
        // Không có giao thức: đường dẫn tương đối thuần ("trang/abc"). Chặn nếu có ':' ở phần đầu (an toàn hơn).
        const head = compact.split(/[/?#]/)[0];
        return head.includes(':') ? '' : url;
    }
    return SAFE_LINK_PROTOCOLS.has(match[1].toLowerCase()) ? url : '';
}

/** Trả URL ảnh an toàn (chỉ https://), hoặc '' nếu không. */
export function sanitizeImageUrl(raw: string | null | undefined): string {
    if (!raw) return '';
    const url = raw.trim();
    return /^https:\/\//i.test(stripUrlNoise(url)) && stripUrlNoise(url) === url.replace(/\s/g, '') ? url : '';
}

export function isExternalUrl(url: string): boolean {
    return /^(https?:)?\/\//i.test(url) || /^mailto:|^tel:/i.test(url);
}

/** Lấy id mẫu từ thân khối ```az-demo (dòng đầu tiên, bỏ khoảng trắng). */
export function parseDemoId(body: string): string {
    return body.trim().split(/\s+/)[0] ?? '';
}

/** Đoạn chèn 1 mẫu vào Markdown (khối riêng, có dòng trống 2 đầu). */
export function buildDemoFence(id: string): string {
    return `\n\n\`\`\`${DEMO_FENCE_LANG}\n${id}\n\`\`\`\n\n`;
}