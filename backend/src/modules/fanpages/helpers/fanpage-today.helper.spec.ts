import { classifyToday, compareNeedAction, groupToday, postsNeeded, TodayClassifiable } from './fanpage-today.helper';
import { CadenceState } from './fanpage-cadence.helper';

const page = (
    state: CadenceState,
    over: Partial<TodayClassifiable['cadence']> & { isTracked?: boolean; id?: number } = {},
): TodayClassifiable & { id: number } => {
    const { isTracked = state !== 'paused', id = 0, ...cadence } = over;
    return {
        id,
        isTracked,
        cadence: { state, daysSinceLastPost: 1, weekCount: 0, target: null, postedToday: false, ...cadence },
    };
};

describe('classifyToday', () => {
    it('Page không theo dõi -> null (không xuất hiện ở đâu)', () => {
        expect(classifyToday(page('paused'))).toBeNull();
        expect(classifyToday(page('silent', { isTracked: false }))).toBeNull();
    });
    it('silent / at_risk chưa đăng hôm nay -> needAction', () => {
        expect(classifyToday(page('silent', { daysSinceLastPost: 5 }))).toBe('needAction');
        expect(classifyToday(page('at_risk', { target: 5, weekCount: 1 }))).toBe('needAction');
    });
    it('đã đăng hôm nay -> postedToday (kể cả khi vẫn at_risk)', () => {
        expect(classifyToday(page('ok', { postedToday: true, daysSinceLastPost: 0 }))).toBe('postedToday');
        expect(classifyToday(page('at_risk', { postedToday: true, daysSinceLastPost: 0 }))).toBe('postedToday');
    });
    it('ok và new chưa đăng hôm nay -> ok (thu gọn)', () => {
        expect(classifyToday(page('ok'))).toBe('ok');
        expect(classifyToday(page('new', { daysSinceLastPost: null }))).toBe('ok');
    });
});

describe('postsNeeded', () => {
    it('không mục tiêu -> 0; đã đủ/vượt -> 0; thiếu -> hiệu số', () => {
        expect(postsNeeded({ target: null, weekCount: 3 })).toBe(0);
        expect(postsNeeded({ target: 5, weekCount: 5 })).toBe(0);
        expect(postsNeeded({ target: 5, weekCount: 7 })).toBe(0);
        expect(postsNeeded({ target: 5, weekCount: 2 })).toBe(3);
    });
});

describe('compareNeedAction / groupToday', () => {
    it('silent đứng trước at_risk', () => {
        const g = groupToday([page('at_risk', { id: 1, target: 5, weekCount: 1 }), page('silent', { id: 2, daysSinceLastPost: 3 })]);
        expect(g.needAction.map((p) => p.id)).toEqual([2, 1]);
    });
    it('silent: chưa từng đăng (null) trước, rồi số ngày giảm dần', () => {
        const g = groupToday([
            page('silent', { id: 1, daysSinceLastPost: 4 }),
            page('silent', { id: 2, daysSinceLastPost: null }),
            page('silent', { id: 3, daysSinceLastPost: 9 }),
        ]);
        expect(g.needAction.map((p) => p.id)).toEqual([2, 3, 1]);
    });
    it('at_risk: thiếu nhiều bài hơn đứng trước', () => {
        const g = groupToday([
            page('at_risk', { id: 1, target: 5, weekCount: 3 }),
            page('at_risk', { id: 2, target: 7, weekCount: 1 }),
        ]);
        expect(g.needAction.map((p) => p.id)).toEqual([2, 1]);
    });
    it('ngang nhau -> giữ thứ tự đầu vào (ổn định)', () => {
        const a = page('silent', { id: 1, daysSinceLastPost: 5 });
        const b = page('silent', { id: 2, daysSinceLastPost: 5 });
        expect(compareNeedAction(a, b)).toBe(0);
        expect(groupToday([a, b]).needAction.map((p) => p.id)).toEqual([1, 2]);
    });
    it('chia đúng 3 nhóm, bỏ Page không theo dõi, không đổi mảng đầu vào', () => {
        const input = [
            page('silent', { id: 1, daysSinceLastPost: 5 }),
            page('ok', { id: 2, postedToday: true, daysSinceLastPost: 0 }),
            page('ok', { id: 3 }),
            page('paused', { id: 4 }),
        ];
        const snapshot = input.map((p) => p.id);
        const g = groupToday(input);
        expect(g.needAction.map((p) => p.id)).toEqual([1]);
        expect(g.postedToday.map((p) => p.id)).toEqual([2]);
        expect(g.ok.map((p) => p.id)).toEqual([3]);
        expect(input.map((p) => p.id)).toEqual(snapshot);
    });
});