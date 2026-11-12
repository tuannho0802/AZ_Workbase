import { normalizeHost } from './fanpageUrl';

/**
 * Xem trước "Dán nhiều link" (B4) - HÀM THUẦN, mirror `fanpage-bulk-posts.helper` + `postUrlKey` của BE. BE vẫn là nơi quyết định cuối
 * (kiểm tra lại khi gửi); FE chỉ để người dùng thấy trước dòng nào hợp lệ / trùng / sai.
 */

export const MAX_BULK_POST_URLS = 50;
export const POST_URL_MAX_LENGTH = 500;

export type BulkRowStatus = 'valid' | 'invalid' | 'too_long' | 'duplicate_in_batch' | 'duplicate_existing';

export interface BulkPreviewRow {
    /** Số dòng người dùng dán (1-based, tính cả dòng trống đã bỏ qua -> để chỉ đúng dòng). */
    line: number;
    url: string;
    status: BulkRowStatus;
    /** Chỉ khi `duplicate_existing`. */
    existingPostedDate?: string | null;
}

const TRACKING = new Set([
    'fbclid', 'gclid', 'gbraid', 'wbraid', 'mibextid', 'igshid', 'igsh', 'ref', 'ref_src', 'ref_url', 'refsrc', 'sfnsn', 'fb_source', 'fb_ref',
    '_rdr', 'locale', 'app', 'is_from_webapp', 'sender_device', 'web_id', '_t', '_r', 'si', 'feature', 'pp', 'share_id', 'share_item_id',
    'share_link_id', 'share_app_id', 'share_author_id', 'sec_user_id', 'source', 'timestamp', 'user_id', 'checksum', 'tt_from',
]);
const isTracking = (k: string) => k.toLowerCase().startsWith('utm_') || TRACKING.has(k.toLowerCase());

/** Khoá so trùng (như `postUrlKey` BE): bỏ #fragment, tham số theo dõi, www/m., http/https, `/` cuối. */
export function postUrlKey(raw: string): string {
    const t = raw.trim();
    let u: URL;
    try {
        u = new URL(t);
    } catch {
        return t.replace(/\/+$/, '').replace(/^https?:\/\//, '');
    }
    const kept: Array<[string, string]> = [];
    u.searchParams.forEach((v, k) => {
        if (!isTracking(k)) kept.push([k, v]);
    });
    kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = kept.length ? '?' + kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
    const port = u.port ? `:${u.port}` : '';
    return `${normalizeHost(u.hostname)}${port}${u.pathname.replace(/\/+$/, '')}${query}`;
}

export function isAcceptablePostUrl(raw: string): boolean {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.hostname.includes('.') && !u.hostname.startsWith('.') && !u.hostname.endsWith('.');
}

/** Tách text dán thành danh sách dòng (bỏ dòng trống, giữ số dòng gốc). */
export function parseBulkLines(text: string): Array<{ line: number; url: string }> {
    const out: Array<{ line: number; url: string }> = [];
    text.split(/\r?\n/).forEach((raw, i) => {
        const url = raw.trim();
        if (url) out.push({ line: i + 1, url });
    });
    return out;
}

export function buildBulkPreview(text: string, existing: ReadonlyArray<{ url: string; postedDate: string | null; id: number }>): BulkPreviewRow[] {
    const byKey = new Map<string, { postedDate: string | null }>();
    for (const e of [...existing].sort((a, b) => a.id - b.id)) {
        const k = postUrlKey(e.url);
        if (!byKey.has(k)) byKey.set(k, { postedDate: e.postedDate });
    }
    const seen = new Set<string>();
    return parseBulkLines(text).map(({ line, url }): BulkPreviewRow => {
        if (!isAcceptablePostUrl(url)) return { line, url, status: 'invalid' };
        if (url.length > POST_URL_MAX_LENGTH) return { line, url, status: 'too_long' };
        const key = postUrlKey(url);
        const dup = byKey.get(key);
        if (dup) return { line, url, status: 'duplicate_existing', existingPostedDate: dup.postedDate };
        if (seen.has(key)) return { line, url, status: 'duplicate_in_batch' };
        seen.add(key);
        return { line, url, status: 'valid' };
    });
}
