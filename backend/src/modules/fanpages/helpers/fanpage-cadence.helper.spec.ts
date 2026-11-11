import {
    computeCadence,
    computeStreak,
    CadenceInput,
    daysBetween,
    daysLeftInWeek,
    isoWeekday,
    isTrackedPage,
    parseSilentDays,
    weekEndOf,
    weekStartOf,
    windowStartOf,
} from './fanpage-cadence.helper';

// 2026-11-09 = Thứ Hai ... 2026-11-15 = Chủ Nhật (2026-11-11 là Thứ Tư).
const MON = '2026-11-09';
const WED = '2026-11-11';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

const input = (over: Partial<CadenceInput> = {}): CadenceInput => ({
    today: WED,
    isTracked: true,
    lastPostDate: '2026-11-10',
    weekCount: 1,
    target: null,
    silentDays: 3,
    createdDate: '2026-01-01',
    ...over,
});

describe('isTrackedPage', () => {
    it('đang theo dõi, chưa lưu trữ, không có tình trạng -> true', () => {
        expect(isTrackedPage({ isActive: true, archivedAt: null, healthIsBlocking: null })).toBe(true);
        expect(isTrackedPage({ isActive: true, archivedAt: undefined, healthIsBlocking: undefined })).toBe(true);
    });
    it('tình trạng không chặn -> true', () => {
        expect(isTrackedPage({ isActive: true, archivedAt: null, healthIsBlocking: false })).toBe(true);
    });
    it('is_active = false -> false', () => {
        expect(isTrackedPage({ isActive: false, archivedAt: null, healthIsBlocking: false })).toBe(false);
    });
    it('đã lưu trữ -> false (Date hoặc chuỗi)', () => {
        expect(isTrackedPage({ isActive: true, archivedAt: new Date(), healthIsBlocking: false })).toBe(false);
        expect(isTrackedPage({ isActive: true, archivedAt: '2026-11-01 10:00:00', healthIsBlocking: false })).toBe(false);
    });
    it('tình trạng is_blocking -> false', () => {
        expect(isTrackedPage({ isActive: true, archivedAt: null, healthIsBlocking: true })).toBe(false);
    });
});

describe('parseSilentDays', () => {
    it.each([
        ['3', 3],
        [' 7 ', 7],
        [5, 5],
        ['1', 1],
        ['30', 30],
    ])('hợp lệ %p -> %p', (raw, expected) => expect(parseSilentDays(raw)).toBe(expected));
    it.each([[null], [undefined], [''], ['abc'], ['0'], ['31'], ['-2'], ['2.5'], ['1e1']])('hỏng %p -> mặc định 3', (raw) =>
        expect(parseSilentDays(raw as never)).toBe(3),
    );
});

describe('tuần Thứ Hai - Chủ Nhật', () => {
    it('isoWeekday: T2=1 ... CN=7', () => {
        expect(isoWeekday(MON)).toBe(1);
        expect(isoWeekday(WED)).toBe(3);
        expect(isoWeekday(SAT)).toBe(6);
        expect(isoWeekday(SUN)).toBe(7);
    });
    it('weekStartOf / weekEndOf cho mọi ngày trong tuần đều cùng 1 tuần', () => {
        for (const d of [MON, '2026-11-10', WED, '2026-11-12', '2026-11-13', SAT, SUN]) {
            expect(weekStartOf(d)).toBe(MON);
            expect(weekEndOf(d)).toBe(SUN);
        }
    });
    it('Chủ Nhật không bị đẩy sang tuần sau, Thứ Hai tuần kế bắt đầu tuần mới', () => {
        expect(weekStartOf('2026-11-16')).toBe('2026-11-16');
        expect(weekStartOf(SUN)).toBe(MON);
    });
    it('biên tháng/năm: tuần chứa 2026-12-31 và 2027-01-01', () => {
        expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
        expect(weekEndOf('2026-12-31')).toBe('2027-01-03');
    });
    it('daysLeftInWeek: Thứ Hai = 7 ... Chủ Nhật = 1 (gồm cả hôm nay)', () => {
        expect(daysLeftInWeek(MON)).toBe(7);
        expect(daysLeftInWeek(WED)).toBe(5);
        expect(daysLeftInWeek(SAT)).toBe(2);
        expect(daysLeftInWeek(SUN)).toBe(1);
    });
    it('windowStartOf(30): hôm nay là ngày thứ 30 của cửa sổ', () => {
        expect(windowStartOf('2026-11-11', 30)).toBe('2026-10-13');
        expect(daysBetween('2026-10-13', '2026-11-11')).toBe(29);
        expect(windowStartOf('2026-11-11', 1)).toBe('2026-11-11');
    });
});

describe('computeStreak', () => {
    it('không có bài -> 0', () => expect(computeStreak(WED, [])).toBe(0));
    it('đăng hôm nay + hôm qua + hôm kia -> 3', () => {
        expect(computeStreak(WED, ['2026-11-11', '2026-11-10', '2026-11-09'])).toBe(3);
    });
    it('hôm nay chưa đăng nhưng hôm qua có -> tính đến hôm qua, CHƯA đứt', () => {
        expect(computeStreak(WED, ['2026-11-10', '2026-11-09'])).toBe(2);
    });
    it('hôm qua và hôm nay đều không đăng -> 0 (đã đứt)', () => {
        expect(computeStreak(WED, ['2026-11-09'])).toBe(0);
    });
    it('có khoảng trống giữa chừng -> chỉ đếm chuỗi liên tiếp mới nhất', () => {
        expect(computeStreak(WED, ['2026-11-11', '2026-11-10', '2026-11-08', '2026-11-07'])).toBe(2);
    });
    it('ngày trùng/không sắp xếp không làm đếm đôi', () => {
        expect(computeStreak(WED, ['2026-11-10', '2026-11-11', '2026-11-10', '2026-11-11'])).toBe(2);
    });
    it('chặn ở cap', () => {
        const dates = Array.from({ length: 45 }, (_, i) => {
            const d = new Date(Date.UTC(2026, 10, 11) - i * 86400000);
            return d.toISOString().slice(0, 10);
        });
        expect(computeStreak(WED, dates)).toBe(30);
        expect(computeStreak(WED, dates, 10)).toBe(10);
    });
});

describe('computeCadence - thứ tự ưu tiên 5 trạng thái', () => {
    it('1) không theo dõi -> paused (ưu tiên cao hơn mọi trạng thái khác, kể cả khi lâu không đăng)', () => {
        expect(computeCadence(input({ isTracked: false, lastPostDate: null, createdDate: '2026-01-01' })).state).toBe('paused');
        expect(computeCadence(input({ isTracked: false, lastPostDate: '2026-10-01' })).state).toBe('paused');
    });

    it('2) Page mới tạo < silentDays ngày và chưa có bài -> new', () => {
        const r = computeCadence(input({ lastPostDate: null, createdDate: '2026-11-10', weekCount: 0 }));
        expect(r.state).toBe('new');
        expect(r.daysSinceLastPost).toBeNull();
    });
    it('Page tạo hôm nay, chưa có bài -> new', () => {
        expect(computeCadence(input({ lastPostDate: null, createdDate: WED })).state).toBe('new');
    });
    it('Page tạo đúng silentDays ngày trước, chưa có bài -> hết ân hạn -> silent', () => {
        expect(computeCadence(input({ lastPostDate: null, createdDate: '2026-11-08' })).state).toBe('silent');
    });
    it('Page mới nhưng ĐÃ có bài -> không phải new', () => {
        expect(computeCadence(input({ lastPostDate: '2026-11-11', createdDate: WED })).state).toBe('ok');
    });

    it('3) chưa từng đăng và quá ân hạn -> silent', () => {
        expect(computeCadence(input({ lastPostDate: null, createdDate: '2026-01-01' })).state).toBe('silent');
    });
    it('cách đúng silentDays ngày -> silent (biên >=)', () => {
        const r = computeCadence(input({ lastPostDate: '2026-11-08' }));
        expect(r.state).toBe('silent');
        expect(r.daysSinceLastPost).toBe(3);
    });
    it('cách silentDays - 1 ngày -> ok', () => {
        expect(computeCadence(input({ lastPostDate: '2026-11-09' })).state).toBe('ok');
    });
    it('silentDays tuỳ chỉnh', () => {
        expect(computeCadence(input({ lastPostDate: '2026-11-10', silentDays: 1 })).state).toBe('silent');
        expect(computeCadence(input({ lastPostDate: '2026-11-04', silentDays: 10 })).state).toBe('ok');
    });
    it('ngày đăng ở TƯƠNG LAI (nhập nhầm) -> kẹp về 0, không âm, không silent', () => {
        const r = computeCadence(input({ lastPostDate: '2026-11-20' }));
        expect(r.daysSinceLastPost).toBe(0);
        expect(r.state).toBe('ok');
    });
    it('silent ưu tiên hơn at_risk', () => {
        expect(computeCadence(input({ lastPostDate: '2026-11-01', target: 5, weekCount: 0 })).state).toBe('silent');
    });

    it('4) có target, thiếu need >= ngày còn lại -> at_risk (Thứ Tư: còn 5 ngày, cần 5 bài)', () => {
        expect(computeCadence(input({ target: 5, weekCount: 0 })).state).toBe('at_risk');
    });
    it('need < ngày còn lại -> ok (Thứ Tư, cần 4 bài / còn 5 ngày)', () => {
        expect(computeCadence(input({ target: 5, weekCount: 1 })).state).toBe('ok');
    });
    it('đã đạt/vượt mục tiêu -> ok', () => {
        expect(computeCadence(input({ target: 3, weekCount: 3 })).state).toBe('ok');
        expect(computeCadence(input({ target: 3, weekCount: 9 })).state).toBe('ok');
    });
    it('Chủ Nhật: còn 1 ngày, thiếu 1 bài -> at_risk; thiếu 0 -> ok', () => {
        expect(computeCadence(input({ today: SUN, lastPostDate: SUN, target: 5, weekCount: 4 })).state).toBe('at_risk');
        expect(computeCadence(input({ today: SUN, lastPostDate: SUN, target: 5, weekCount: 5 })).state).toBe('ok');
    });
    it('Thứ Hai: còn 7 ngày, target 7 chưa đăng -> at_risk; target 6 -> ok', () => {
        expect(computeCadence(input({ today: MON, lastPostDate: '2026-11-08', target: 7, weekCount: 0 })).state).toBe('at_risk');
        expect(computeCadence(input({ today: MON, lastPostDate: '2026-11-08', target: 6, weekCount: 0 })).state).toBe('ok');
    });
    it('không đặt target -> không bao giờ at_risk', () => {
        expect(computeCadence(input({ target: null, weekCount: 0 })).state).toBe('ok');
    });

    it('5) mặc định ok', () => expect(computeCadence(input()).state).toBe('ok'));
});

describe('computeCadence - giá trị phụ', () => {
    it('postedToday chỉ đúng khi lastPostDate = hôm nay', () => {
        expect(computeCadence(input({ lastPostDate: WED })).postedToday).toBe(true);
        expect(computeCadence(input({ lastPostDate: '2026-11-10' })).postedToday).toBe(false);
        expect(computeCadence(input({ lastPostDate: null })).postedToday).toBe(false);
    });
    it('streak lấy từ recentPostDates; thiếu thì lùi về lastPostDate', () => {
        expect(computeCadence(input({ lastPostDate: WED, recentPostDates: ['2026-11-11', '2026-11-10'] })).streak).toBe(2);
        expect(computeCadence(input({ lastPostDate: WED })).streak).toBe(1);
    });
    it('trả lại weekCount/target đầu vào để FE không tính lại', () => {
        const r = computeCadence(input({ weekCount: 3, target: 5 }));
        expect(r.weekCount).toBe(3);
        expect(r.target).toBe(5);
    });
    it('Page paused vẫn có giá trị phụ hợp lệ', () => {
        const r = computeCadence(input({ isTracked: false, lastPostDate: '2026-11-10' }));
        expect(r.daysSinceLastPost).toBe(1);
    });
});