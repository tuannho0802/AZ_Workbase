import type { FanpageLeadDraft } from '@/lib/api/fanpages.api';

/** Cùng regex `FanpageLeadDto.phone` của BE - KHÔNG nhận `MISSING_*` (Lead từ Page bắt buộc SĐT thật). */
export const LEAD_PHONE_RE = /^(09|08|07|03|05)[0-9]{8}$/;

/** Chuẩn hoá giá trị form -> payload gửi BE (trim, bỏ chuỗi rỗng). Hàm thuần để test. */
export function buildLeadPayload(v: { name?: string; phone?: string; email?: string; source?: string; note?: string }): FanpageLeadDraft {
    const clean = (x?: string) => {
        const t = x?.trim();
        return t ? t : undefined;
    };
    return {
        name: (v.name ?? '').trim(),
        phone: (v.phone ?? '').trim(),
        email: clean(v.email),
        source: clean(v.source),
        note: clean(v.note),
    };
}

interface DuplicateMatch {
    creatorName: string;
    salesUserName: string | null;
    groupNames: string[];
}

/** Câu cảnh báo khi SĐT trùng (X30): chỉ nêu người tạo/Sales/nhóm, KHÔNG in id hay SĐT. */
export function describeLeadDuplicate(match: DuplicateMatch): string {
    const parts = [`Số điện thoại này đã được ${match.creatorName} thêm vào danh sách Khách hàng`];
    if (match.salesUserName && match.salesUserName !== match.creatorName) parts.push(`Sales phụ trách ${match.salesUserName}`);
    if (match.groupNames.length > 0) parts.push(`đã tham gia nhóm ${match.groupNames.join(', ')}`);
    return `${parts.join(', ')}.`;
}

/** Q11: nguồn mặc định = nền tảng của Page nếu khớp (không phân biệt hoa/thường) 1 nguồn đang mở; không khớp -> undefined (bắt chọn). */
export function defaultLeadSource(platformName: string | undefined, openSourceNames: string[]): string | undefined {
    const want = platformName?.trim().toLowerCase();
    if (!want) return undefined;
    return openSourceNames.find((n) => n.trim().toLowerCase() === want);
}
