import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FanpageRankingsService } from './fanpage-rankings.service';

const qbReturning = (rows: unknown[]) => {
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['select', 'where', 'andWhere']) qb[m] = jest.fn(() => qb);
    qb.getMany = jest.fn().mockResolvedValue(rows);
    return qb;
};

interface Setup {
    view: 'own' | 'department' | 'all' | null;
    managed?: number[];
    pages?: Array<{ id: number; targetPostsPerWeek: number | null; owners: Array<{ id: number }> }>;
    posts?: Array<Record<string, unknown>>;
    snaps?: Array<Record<string, unknown>>;
    users?: Array<{ id: number; name: string; employeeCode: string; departmentId: number | null }>;
}

function build(s: Setup) {
    const postQb = qbReturning(s.posts ?? []);
    const snapQb = qbReturning(s.snaps ?? []);
    const postRepo = { createQueryBuilder: jest.fn(() => postQb) };
    const snapRepo = { createQueryBuilder: jest.fn(() => snapQb) };
    const userRepo = { find: jest.fn().mockResolvedValue(s.users ?? []) };
    const access = { scopesForKey: jest.fn().mockResolvedValue({ view: s.view, managed: s.managed ?? [], flagScopes: {} }) };
    const scoped = { loadTrackable: jest.fn().mockResolvedValue(s.pages ?? []) };
    const svc = new FanpageRankingsService(postRepo as never, snapRepo as never, userRepo as never, access as never, scoped as never);
    return { svc, access, scoped, postRepo, snapRepo, userRepo };
}

const caller = { id: 10, role: 'employee', departmentId: 1 } as never;
const RANGE = { from: '2026-10-05', to: '2026-10-11' };
const pages = [{ id: 1, targetPostsPerWeek: null, owners: [{ id: 10 }, { id: 11 }, { id: 12 }] }];
const users = [
    { id: 10, name: 'An', employeeCode: 'NV10', departmentId: 1 },
    { id: 11, name: 'Bình', employeeCode: 'NV11', departmentId: 1 },
    { id: 12, name: 'Chi', employeeCode: 'NV12', departmentId: 2 },
    { id: 99, name: 'Admin nhập hộ', employeeCode: 'AD1', departmentId: null },
];
const mk = (id: number, by: number, date: string, url: string) => ({ id, fanpageId: 1, url, postedDate: date, createdById: by });
const posts = [
    mk(1, 10, '2026-10-06', 'https://a.com/1'),
    mk(2, 11, '2026-10-06', 'https://a.com/2'),
    mk(3, 11, '2026-10-07', 'https://a.com/3'),
    mk(4, 12, '2026-10-07', 'https://a.com/4'),
    mk(5, 99, '2026-10-08', 'https://a.com/5'), // nhập hộ
];

describe('FanpageRankingsService - quyền & phạm vi', () => {
    beforeEach(() => {
        jest.useFakeTimers({ now: new Date('2026-11-12T05:00:00Z') });
    });
    afterEach(() => jest.useRealTimers());

    it('không có fanpage_rankings.view -> 403, không đụng DB', async () => {
        const { svc, scoped } = build({ view: null });
        await expect(svc.rankings(caller, RANGE)).rejects.toBeInstanceOf(ForbiddenException);
        expect(scoped.loadTrackable).not.toHaveBeenCalled();
    });

    it('kỳ không hợp lệ (đến ngày ở tương lai) -> 400', async () => {
        const { svc } = build({ view: 'all' });
        await expect(svc.rankings(caller, { from: '2026-11-01', to: '2026-12-31' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('scope all: thấy mọi người đóng góp, xếp theo số bài; người nhập hộ không có dòng nhưng được đếm ở chú thích', async () => {
        const { svc } = build({ view: 'all', pages, posts, users });
        const r = await svc.rankings(caller, RANGE);
        expect(r.scope).toBe('all');
        expect(r.rows.map((x) => [x.name, x.posts, x.rank])).toEqual([['Bình', 2, 1], ['An', 1, 2], ['Chi', 1, 2]]);
        expect(r.rows.find((x) => x.userId === 99)).toBeUndefined();
        expect(r.nonOwnerPosts).toBe(1);
        expect(r.rows.find((x) => x.name === 'An')?.isMe).toBe(true);
    });

    it('scope own: chỉ còn dòng của chính mình, hạng tính trong tập này (1), chú thích chỉ đếm bài của mình', async () => {
        const { svc } = build({ view: 'own', pages, posts, users });
        const r = await svc.rankings(caller, RANGE);
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]).toMatchObject({ userId: 10, rank: 1, posts: 1 });
        expect(r.nonOwnerPosts).toBe(0); // bài nhập hộ của Admin không thuộc tập người xem được thấy
    });

    it('scope department: thấy người thuộc phòng ban mình quản lý + chính mình; người phòng khác không lộ, hạng không bị họ đẩy', async () => {
        const { svc } = build({ view: 'department', managed: [1], pages, posts, users });
        const r = await svc.rankings(caller, RANGE);
        expect(r.rows.map((x) => x.name)).toEqual(['Bình', 'An']); // Chi (phòng 2) bị ẩn
        expect(r.rows.map((x) => x.rank)).toEqual([1, 2]);
    });

    it('scope department nhưng không quản lý phòng ban nào -> chỉ thấy chính mình', async () => {
        const { svc } = build({ view: 'department', managed: [], pages, posts, users });
        const r = await svc.rankings(caller, RANGE);
        expect(r.rows.map((x) => x.name)).toEqual(['An']);
    });

    it('chỉ truy vấn Page đang theo dõi (loadTrackable) và lọc kỳ ở SQL; người dùng nạp 1 lần theo danh sách ID', async () => {
        const { svc, scoped, userRepo, postRepo } = build({ view: 'all', pages, posts, users });
        await svc.rankings(caller, RANGE);
        expect(scoped.loadTrackable).toHaveBeenCalledTimes(1);
        expect(postRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
        expect(userRepo.find).toHaveBeenCalledTimes(1);
    });

    it('không Page nào / không đóng góp -> trả rỗng, không gọi nạp người dùng', async () => {
        const { svc, userRepo } = build({ view: 'all', pages: [], users });
        const r = await svc.rankings(caller, RANGE);
        expect(r.rows).toEqual([]);
        expect(r.nonOwnerPosts).toBe(0);
        expect(userRepo.find).not.toHaveBeenCalled();
    });

    it('số liệu định kỳ do người phụ trách nhập được tính; số liệu nhập hộ thì không', async () => {
        const snaps = [
            { fanpageId: 1, snapshotDate: '2026-10-06', createdById: 12 },
            { fanpageId: 1, snapshotDate: '2026-10-07', createdById: 99 },
        ];
        const { svc } = build({ view: 'all', pages, snaps, users });
        const r = await svc.rankings(caller, RANGE);
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]).toMatchObject({ userId: 12, snapshots: 1, posts: 0 });
    });
});