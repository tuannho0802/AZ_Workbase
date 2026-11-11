/**
 * Tự nhận nền tảng từ link khi dán vào form Page. Mirror `detectPlatformByUrl` ở BE
 * (`fanpages/helpers/fanpage-url.helper.ts`) - BE vẫn là nguồn sự thật cho việc CHỐNG TRÙNG URL; FE chỉ gợi ý chọn sẵn nền tảng.
 * Mơ hồ (host khớp >= 2 nền tảng) hoặc không khớp -> null (để người dùng tự chọn, không đoán bừa).
 */
export interface PlatformDomainInfo {
    id: number;
    urlDomains?: string | null;
}

/** Hạ chữ thường, bỏ `www.` rồi `m.`/`mobile.`/`mbasic.`/`web.` đầu host (đúng như BE). */
export function normalizeHost(host: string): string {
    return host
        .trim()
        .toLowerCase()
        .replace(/^www\./, '')
        .replace(/^(m|mobile|mbasic|web)\./, '');
}

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
            const d = normalizeHost(raw);
            if (d && (host === d || host.endsWith(`.${d}`))) matched.add(p.id);
        }
    }
    return matched.size === 1 ? [...matched][0] : null;
}
