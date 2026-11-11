import {
    currentSilentMilestone,
    effectiveSilentDays,
    FANPAGE_REMINDER_START_HOUR_VN,
    isReminderHour,
    silentDedupeSuffix,
    silentMilestones,
} from './fanpage-reminder.helper';

describe('isReminderHour', () => {
    it('chỉ từ 17:00 giờ VN trở đi', () => {
        expect(FANPAGE_REMINDER_START_HOUR_VN).toBe(17);
        expect(isReminderHour(16)).toBe(false);
        expect(isReminderHour(17)).toBe(true);
        expect(isReminderHour(23)).toBe(true);
        expect(isReminderHour(0)).toBe(false);
    });
});

describe('silentMilestones', () => {
    it('mặc định 3 -> 3, 7, 14, 30', () => {
        expect(silentMilestones(3)).toEqual([3, 7, 14, 30]);
    });
    it('ngưỡng tuỳ chỉnh: mốc đầu = ngưỡng, bỏ mốc cố định nhỏ hơn/bằng', () => {
        expect(silentMilestones(5)).toEqual([5, 7, 14, 30]);
        expect(silentMilestones(7)).toEqual([7, 14, 30]);
        expect(silentMilestones(1)).toEqual([1, 3, 7, 14, 30]);
        expect(silentMilestones(30)).toEqual([30]);
    });
});

describe('currentSilentMilestone', () => {
    it.each([
        [0, null],
        [2, null],
        [3, 3],
        [6, 3],
        [7, 7],
        [13, 7],
        [14, 14],
        [29, 14],
        [30, 30],
        [200, 30],
    ])('3 ngày: %i ngày im lặng -> mốc %s', (days, expected) => {
        expect(currentSilentMilestone(days as number, 3)).toBe(expected);
    });
    it('ngưỡng 5: 4 ngày chưa tới mốc đầu', () => {
        expect(currentSilentMilestone(4, 5)).toBeNull();
        expect(currentSilentMilestone(5, 5)).toBe(5);
    });
});

describe('effectiveSilentDays', () => {
    it('tính từ bài gần nhất', () => {
        expect(effectiveSilentDays('2026-11-11', '2026-11-06', '2026-01-01')).toBe(5);
    });
    it('chưa có bài -> tính từ ngày tạo Page', () => {
        expect(effectiveSilentDays('2026-11-11', null, '2026-11-01')).toBe(10);
    });
    it('ngày ở tương lai không cho ra số âm', () => {
        expect(effectiveSilentDays('2026-11-11', '2026-11-20', '2026-01-01')).toBe(0);
    });
});

describe('silentDedupeSuffix', () => {
    it('cùng đợt im lặng + cùng mốc -> cùng khoá; đăng lại rồi im lặng lần nữa -> khoá khác', () => {
        expect(silentDedupeSuffix('2026-11-05', 3)).toBe(silentDedupeSuffix('2026-11-05', 3));
        expect(silentDedupeSuffix('2026-11-05', 3)).not.toBe(silentDedupeSuffix('2026-11-05', 7));
        expect(silentDedupeSuffix('2026-11-05', 3)).not.toBe(silentDedupeSuffix('2026-12-01', 3));
    });
});