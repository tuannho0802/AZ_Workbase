import { describe, expect, it } from 'vitest';
import { formatAgo } from './format-ago';

describe('formatAgo', () => {
    it('phân mức vừa xong / phút / giờ / ngày; số âm coi như 0', () => {
        expect(formatAgo(-5)).toBe('vừa xong');
        expect(formatAgo(59)).toBe('vừa xong');
        expect(formatAgo(90)).toBe('1 phút trước');
        expect(formatAgo(7300)).toBe('2 giờ trước');
        expect(formatAgo(90000)).toBe('1 ngày trước');
    });
});