import { describe, expect, it } from 'vitest';
import { countryName, countryOptions } from './country';

describe('country util', () => {
    it('countryName: mã hợp lệ -> tên; rỗng -> ""', () => {
        expect(countryName('VN')).toBeTruthy();
        expect(countryName('VN')).not.toBe('VN');
        expect(countryName(null)).toBe('');
    });
    it('countryOptions: có VN/US, không có mã giả (ZZ, XK, AA)', () => {
        const codes = countryOptions().map((o) => o.value);
        expect(codes).toContain('VN');
        expect(codes).toContain('US');
        for (const bad of ['ZZ', 'XK', 'AA', 'QZ']) expect(codes).not.toContain(bad);
    });
});
