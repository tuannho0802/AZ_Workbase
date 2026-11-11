/**
 * Chuẩn hoá URL bài đăng + tự nhận nền tảng từ link - HÀM THUẦN (PLAN 6.4, A5). Dùng để so TRÙNG bài trong cùng Page.
 * Quy tắc: hạ chữ thường scheme+host, bỏ `www.`, bỏ `#fragment`, bỏ tham số theo dõi (`utm_*`, `fbclid`, `mibextid`...),
 * sắp xếp tham số còn lại, bỏ dấu `/` ở cuối đường dẫn. Phần path GIỮ NGUYÊN chữ hoa/thường (ID bài có thể phân biệt).
 */

const TRACKING_PARAMS = new Set([
    'fbclid',
    'gclid',
    'gbraid',
    'wbraid',
    'mibextid',
    'igshid',
    'igsh',
    'ref',
    'ref_src',
    'ref_url',
    'refsrc',
    'sfnsn',
    'fb_source',
    'fb_ref',
    '_rdr',
    'locale',
    'app',
    'is_from_webapp',
    'sender_device',
    'web_id',
    '_t',
    '_r',
    'si',
    'feature',
    'pp',
    'share_id',
    'share_item_id',
    'share_link_id',
    'share_app_id',
    'share_author_id',
    'sec_user_id',
    'source',
    'timestamp',
    'user_id',
    'checksum',
    'tt_from',
]);

const isTrackingParam = (key: string): boolean => {
    const k = key.toLowerCase();
    return k.startsWith('utm_') || TRACKING_PARAMS.has(k);
};

/** Host đã hạ chữ thường, bỏ `www.` và `m.`/`mobile.` đầu - để `m.facebook.com` và `facebook.com` cùng khoá. */
export function normalizeHost(host: string): string {
    return host
        .toLowerCase()
        .replace(/^www\./, '')
        .replace(/^(m|mobile|mbasic|web)\./, '');
}

/**
 * Chuẩn hoá URL bài đăng. Chuỗi không phải URL hợp lệ -> trả bản đã trim + bỏ `/` cuối (không ném lỗi - DTO đã validate).
 */
export function normalizePostUrl(raw: string): string {
    const trimmed = raw.trim();
    let u: URL;
    try {
        u = new URL(trimmed);
    } catch {
        return trimmed.replace(/\/+$/, '');
    }
    const host = normalizeHost(u.hostname);
    const kept: Array<[string, string]> = [];
    u.searchParams.forEach((value, key) => {
        if (!isTrackingParam(key)) kept.push([key, value]);
    });
    kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = kept.length ? '?' + kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
    const path = u.pathname.replace(/\/+$/, '');
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol.toLowerCase()}//${host}${port}${path}${query}`;
}

/** Khoá so trùng: như `normalizePostUrl` nhưng bỏ phân biệt http/https. */
export function postUrlKey(raw: string): string {
    return normalizePostUrl(raw).replace(/^https?:\/\//, '');
}

/** Chuẩn hoá danh sách domain nhập tay ('Facebook.com, fb.com ,,') -> 'facebook.com,fb.com'; rỗng -> null. */
export function normalizeUrlDomains(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const list: string[] = [];
    for (const part of raw.split(',')) {
        const d = part.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
        if (d && !list.includes(d)) list.push(d);
    }
    return list.length ? list.join(',') : null;
}

export interface PlatformDomainInfo {
    id: number;
    urlDomains: string | null;
}

/**
 * Tự nhận nền tảng từ link Page/bài: host khớp đúng domain hoặc là subdomain của domain đã khai báo.
 * Mơ hồ (host khớp >= 2 nền tảng) hoặc không khớp -> null (để người dùng tự chọn, không đoán bừa).
 */
export function detectPlatformByUrl(url: string, platforms: ReadonlyArray<PlatformDomainInfo>): number | null {
    let host: string;
    try {
        host = normalizeHost(new URL(url.trim()).hostname);
    } catch {
        return null;
    }
    const matched = new Set<number>();
    for (const p of platforms) {
        if (!p.urlDomains) continue;
        for (const raw of p.urlDomains.split(',')) {
            const d = normalizeHost(raw.trim());
            if (d && (host === d || host.endsWith(`.${d}`))) matched.add(p.id);
        }
    }
    return matched.size === 1 ? [...matched][0] : null;
}