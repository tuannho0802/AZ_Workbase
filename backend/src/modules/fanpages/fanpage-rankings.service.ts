import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FanpageMetricSnapshot } from '../../database/entities/fanpage-metric-snapshot.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { User } from '../../database/entities/user.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { StatsRangeQueryDto } from './dto/fanpage-metrics.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FANPAGE_BATCH_SIZE } from './fanpage-insights.service';
import { FanpageScopedQuery } from './fanpage-scoped-query';
import { resolveStatsRange } from './helpers/fanpage-metrics.helper';
import {
    RankPage,
    RankPost,
    RankSnapshot,
    RankingRowBase,
    aggregateContributions,
    buildRankingRows,
    sumNonOwnerPosts,
} from './helpers/fanpage-rankings.helper';

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

export interface RankingRow extends RankingRowBase {
    name: string;
    employeeCode: string | null;
    /** Dòng của chính người xem - FE tô nổi. */
    isMe: boolean;
}

export interface RankingsResponse {
    from: string;
    to: string;
    /** Scope `fanpage_rankings.view`: own = chỉ dòng mình · department = người thuộc phòng ban mình quản lý · all. */
    scope: 'own' | 'department' | 'all';
    rows: RankingRow[];
    /** Số bài do người KHÔNG phụ trách Page ghi (thuộc những người trong tập xem được) - chú thích \"không tính xếp hạng\". */
    nonOwnerPosts: number;
}

type RankUser = Pick<User, 'id' | 'name' | 'employeeCode' | 'departmentId'>;

/**
 * Xếp hạng đóng góp (B5) theo PLAN 3.8. Luật tính nằm ở `fanpage-rankings.helper` (hàm thuần có spec); service chỉ nạp dữ liệu
 * + áp quyền xem. Quyền `fanpage_rankings.view` quyết định TẬP NGƯỜI được thấy (không phải tập Page): thứ hạng chỉ tính trong tập đó.
 * Chỉ Page đang theo dõi (`isTracked`). Không có khách, không có tiền.
 */
@Injectable()
export class FanpageRankingsService {
    constructor(
        @InjectRepository(FanpagePost)
        private readonly postRepo: Repository<FanpagePost>,
        @InjectRepository(FanpageMetricSnapshot)
        private readonly snapRepo: Repository<FanpageMetricSnapshot>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
    ) { }

    async rankings(user: FanpageCaller, q: StatsRangeQueryDto): Promise<RankingsResponse> {
        const scopes = await this.access.scopesForKey(user, 'fanpage_rankings.view');
        const scope = scopes.view;
        if (scope !== 'own' && scope !== 'department' && scope !== 'all') throw new ForbiddenException('Bạn không có quyền xem xếp hạng');

        const today = todayVnStr();
        const range = resolveStatsRange(q.from, q.to, today);
        if (!range.ok) throw new BadRequestException(range.message);
        const { from, to } = range;

        // Page đang theo dõi TOÀN HỆ THỐNG: quyền xếp hạng giới hạn NGƯỜI được thấy, không giới hạn Page.
        const pages = await this.scoped.loadTrackable();
        const rankPages: RankPage[] = pages.map((p) => ({
            id: p.id,
            target: p.targetPostsPerWeek ?? null,
            ownerIds: (p.owners ?? []).map((o) => o.id),
        }));
        const ids = rankPages.map((p) => p.id);

        const posts: RankPost[] = [];
        const snapshots: RankSnapshot[] = [];
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            const [ps, ss] = await Promise.all([
                this.postRepo
                    .createQueryBuilder('p')
                    .select(['p.id', 'p.fanpageId', 'p.url', 'p.postedDate', 'p.createdById'])
                    .where('p.fanpageId IN (:...ids)', { ids: batch })
                    .andWhere('p.postedDate >= :from', { from })
                    .andWhere('p.postedDate <= :to', { to })
                    .getMany(),
                this.snapRepo
                    .createQueryBuilder('s')
                    .select(['s.fanpageId', 's.snapshotDate', 's.createdById'])
                    .where('s.fanpageId IN (:...ids)', { ids: batch })
                    .andWhere('s.snapshotDate >= :from', { from })
                    .andWhere('s.snapshotDate <= :to', { to })
                    .getMany(),
            ]);
            for (const p of ps) posts.push({ id: p.id, fanpageId: p.fanpageId, url: p.url, postedDate: p.postedDate, createdById: p.createdById });
            for (const s of ss) snapshots.push({ fanpageId: s.fanpageId, snapshotDate: s.snapshotDate, createdById: s.createdById });
        }

        const agg = aggregateContributions({ pages: rankPages, posts, snapshots, from, to, today });

        // Người có thể xuất hiện: người đóng góp + người nhập hộ (chỉ để đếm chú thích). Lọc theo phạm vi xem.
        const userIds = [...new Set([...agg.byUser.keys(), ...agg.nonOwnerPostsByUser.keys()])];
        const users: RankUser[] = userIds.length
            ? await this.userRepo.find({ where: { id: In(userIds) }, select: ['id', 'name', 'employeeCode', 'departmentId'] })
            : [];
        const visible = new Set<number>();
        for (const u of users) {
            if (scope === 'all') visible.add(u.id);
            else if (u.id === user.id) visible.add(u.id);
            else if (scope === 'department' && u.departmentId != null && scopes.managed.includes(u.departmentId)) visible.add(u.id);
        }
        const byId = new Map(users.map((u) => [u.id, u]));

        const rows: RankingRow[] = [];
        for (const r of buildRankingRows(agg.byUser, visible)) {
            const u = byId.get(r.userId);
            if (!u) continue;
            rows.push({ ...r, name: u.name, employeeCode: u.employeeCode ?? null, isMe: u.id === user.id });
        }
        return { from, to, scope, rows, nonOwnerPosts: sumNonOwnerPosts(agg.nonOwnerPostsByUser, visible) };
    }
}