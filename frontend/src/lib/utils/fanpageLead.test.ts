import { describe, expect, it } from 'vitest';
import { LEAD_PHONE_RE, buildLeadPayload, defaultLeadSource, describeLeadDuplicate } from './fanpageLead';

describe('fanpageLead utils (GĐ5b)', () => {
    it('LEAD_PHONE_RE: nhận SĐT VN hợp lệ, từ chối rỗng/MISSING_*/sai độ dài', () => {
        expect(LEAD_PHONE_RE.test('0901234567')).toBe(true);
        expect(LEAD_PHONE_RE.test('')).toBe(false);
        expect(LEAD_PHONE_RE.test('MISSING_12')).toBe(false);
        expect(LEAD_PHONE_RE.test('090123456')).toBe(false);
    });

    it('buildLeadPayload: trim và bỏ trường rỗng', () => {
        expect(buildLeadPayload({ name: ' An ', phone: ' 0901234567 ', email: ' ', source: '', note: ' ghi chú ' })).toEqual({
            name: 'An',
            phone: '0901234567',
            email: undefined,
            source: undefined,
            note: 'ghi chú',
        });
    });

    it('describeLeadDuplicate: chỉ nêu người tạo/Sales/nhóm, không in id hay SĐT', () => {
        const text = describeLeadDuplicate({ creatorName: 'Lan', salesUserName: 'Minh', groupNames: ['Nhóm A'] });
        expect(text).toContain('Lan');
        expect(text).toContain('Sales phụ trách Minh');
        expect(text).toContain('Nhóm A');
        expect(text).not.toMatch(/\d{9,}/);
        expect(describeLeadDuplicate({ creatorName: 'Lan', salesUserName: 'Lan', groupNames: [] })).not.toContain('Sales phụ trách');
    });

    it('defaultLeadSource: khớp không phân biệt hoa/thường, không khớp -> undefined', () => {
        expect(defaultLeadSource('facebook', ['TikTok', 'Facebook'])).toBe('Facebook');
        expect(defaultLeadSource('Zalo', ['TikTok', 'Facebook'])).toBeUndefined();
        expect(defaultLeadSource(undefined, ['Facebook'])).toBeUndefined();
    });
});
