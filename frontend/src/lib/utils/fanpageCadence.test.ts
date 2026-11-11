import { describe, expect, it } from 'vitest';
import { CADENCE_META, formatSinceLastPost, formatStreak, formatWeekProgress, postsNeeded } from './fanpageCadence';

describe('fanpageCadence (chỉ hiển thị)', () => {
    it('mỗi trạng thái đều có nhãn + icon + màu (không chỉ dựa vào màu)', () => {
        for (const state of ['paused', 'new', 'silent', 'at_risk', 'ok'] as const) {
            const m = CADENCE_META[state];
            expect(m.label.length).toBeGreaterThan(0);
            expect(m.icon.length).toBeGreaterThan(0);
            expect(m.color.length).toBeGreaterThan(0);
        }
    });
    it('formatWeekProgress', () => {
        expect(formatWeekProgress({ weekCount: 3, target: 5 })).toBe('3/5');
        expect(formatWeekProgress({ weekCount: 3, target: null })).toBe('3');
    });
    it('formatSinceLastPost', () => {
        expect(formatSinceLastPost({ daysSinceLastPost: null })).toBe('Chưa có bài');
        expect(formatSinceLastPost({ daysSinceLastPost: 0 })).toBe('Hôm nay');
        expect(formatSinceLastPost({ daysSinceLastPost: 1 })).toBe('Hôm qua');
        expect(formatSinceLastPost({ daysSinceLastPost: 5 })).toBe('5 ngày trước');
    });
    it('postsNeeded: không âm, không mục tiêu = 0', () => {
        expect(postsNeeded({ weekCount: 2, target: 5 })).toBe(3);
        expect(postsNeeded({ weekCount: 7, target: 5 })).toBe(0);
        expect(postsNeeded({ weekCount: 2, target: null })).toBe(0);
    });
    it('formatStreak: trần 30 hiện 30+', () => {
        expect(formatStreak(4)).toBe('4');
        expect(formatStreak(30)).toBe('30+');
    });
});
