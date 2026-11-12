import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { GrowthQueryDto, StatsRangeQueryDto, TopPostsQueryDto } from './dto/fanpage-metrics.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FANPAGE_BATCH_SIZE } from './fanpage-insights.service';
import { FanpageMetricsService } from './fanpage-metrics.service';
import { FanpageScopedQuery, requireViewScope } from './fanpage-scoped-query';
import { isTrackedPage } from './helpers/fanpage-cadence.helper';
import {
    FANPAGE_STATS_MAX_COMPARE,
    GrowthGroupBy,
    Heatmap,
    WeeklyPostBucket,
    bucketPostsByWeek,
    buildGrowthBuckets,
    buildGrowthSeries,
    buildHeatmap,
    pickGrowthGroupBy,
    resolveStatsRange,
    windowGain,
} from './helpers/fanpage-metrics.helper';
import { addDays } from '../utms/helpers/utm-stats.helper';

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

export interface GrowthResponse {
    from: string;
    to: string;
    groupBy: GrowthGroupBy;
    points: Array<{ key: string; total: number; pagesWithData: number }>;
    perPage: Array<{ id: number; name: string; values: Array<number | null> }>;
    /** Page trong phạm vi nhưng chưa có số liệu nào -> bỏ khỏi tổng (PLAN 3.6). */
    pagesWithoutMetrics: number;
    totalPages: number;
    /** Tổng follower tăng/giảm trong kỳ, chỉ cộng Page ĐỦ dữ liệu để so (≥ 2 mốc). */
    gain: { total: number; pagesWithGain: number };
    /** Bảng theo Page (đủ dữ liệu), tăng nhiều nhất trước - kèm mốc so sánh để không hiểu nhầm. */
    pageRows: Array<{ id: number; name: string; followers: number; latestDate: string; gain: number; baselineDate: string }>;
    /** Danh sách Page để chọn so sánh trên chart. */
    pages: Array<{ id: number; name: string }>;
}

export interface PostsStatsResponse {
    from: string;
    to: string;
    weeks: WeeklyPostBucket[];
    totalPosts: number;
    /** Tổng mục tiêu bài/tuần của các Page đang theo dõi trong phạm vi (đường ngang trên chart); 0 = chưa Page nào đặt mục tiêu. */
    weeklyTarget: number;
}

export interface TopPostRow {
    id: number;
    fanpageId: number;
    fanpageName: string;
    title: string | null;
    url: string;
    postedDate: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    interactions: number;
}

export interface TopPostsResponse {
    from: string;
    to: string;
    posts: TopPostRow[];
    /** Bài có ngày đăng trong kỳ nhưng chưa nhập số liệu nào - FE ghi chú "N bài chưa nhập số liệu". */
    postsWithoutMetrics: number;
}

type RawTopPost = {
    id: number | string;
    fanpageId: number | string;
    title: string | null;
    url: string;
    postedDate: string | null;
    views: number | string | null;
    likes: number | string | null;
    comments: number | string | null;
    shares: number | string | null;
    interactions: number | string;
};

const nOrNull = (v: number | string | null): number | null => (v == null ? null : Number(v));

/**
 * Thống kê Fanpage (tab "Thống kê" - A3, C1, C4). Phạm vi Page do `fanpage_stats.view` quyết định, dựng bằng CÙNG
 * `FanpageScopedQuery` với danh sách (X3). Chỉ Page chưa lưu trữ. Mọi số liệu = nhập tay hoặc dữ liệu nội bộ sẵn có.
 */
@Injectable()
export class FanpageStatsService {
    constructor(
        @InjectRepository(FanpagePost)
        private readonly postRepo: Repository<FanpagePost>,
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
        private readonly metrics: FanpageMetricsService,
    ) { }

    private range(q: StatsRangeQueryDto): { from: string; to: string } {
        const r = resolveStatsRange(q.from, q.to, todayVnStr());
        if (!r.ok) throw new BadRequestException(r.message);
        return { from: r.from, to: r.to };
    }

    private async scopedPages(user: FanpageCaller): Promise<Fanpage[]> {
        const scopes = await this.access.scopesForKey(user, 'fanpage_stats.view');
        requireViewScope(scopes);
        return this.scoped.load(user, scopes, { archived: 'false' });
    }

    /** `GET /fanpages/stats/growth` - chuỗi follower tổng (+ vài Page để so sánh) theo tuần/tháng, carry-forward (PLAN 3.6). */
    async growth(user: FanpageCaller, q: GrowthQueryDto): Promise<GrowthResponse> {
        const { from, to } = this.range(q);
        const groupBy = q.groupBy ?? pickGrowthGroupBy(from, to);
        const pages = await this.scopedPages(user);
        const ids = pages.map((p) => p.id);
        const nameOf = new Map(pages.map((p) => [p.id, p.name]));

        const compare = [...new Set(q.pageIds ?? [])].filter((id) => nameOf.has(id)); // Page ngoài phạm vi bị bỏ qua, không báo lỗi lộ thông tin
        if (compare.length > FANPAGE_STATS_MAX_COMPARE) throw new BadRequestException(`Chỉ so sánh tối đa ${FANPAGE_STATS_MAX_COMPARE} Page`);

        const seriesByPage = await this.metrics.followerSeries(ids, from, to);
        const input = ids.map((id) => ({ id, rows: seriesByPage.get(id) ?? [] }));
        const series = buildGrowthSeries(input, buildGrowthBuckets(from, to, groupBy), new Set(compare));

        let total = 0;
        const pageRows: GrowthResponse['pageRows'] = [];
        for (const p of input) {
            const g = windowGain(p.rows, from, to);
            if (!g) continue;
            total += g.gain;
            const latest = p.rows.filter((r) => r.date <= to).pop();
            pageRows.push({ id: p.id, name: nameOf.get(p.id) ?? '', followers: latest?.value ?? 0, latestDate: g.latestDate, gain: g.gain, baselineDate: g.baselineDate });
        }
        pageRows.sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name, 'vi'));

        return {
            from,
            to,
            groupBy,
            points: series.points,
            perPage: series.perPage.map((p) => ({ id: p.id, name: nameOf.get(p.id) ?? '', values: p.values })),
            pagesWithoutMetrics: series.pagesWithoutMetrics,
            totalPages: ids.length,
            gain: { total, pagesWithGain: pageRows.length },
            pageRows,
            pages: pages.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
        };
    }

    /** `GET /fanpages/stats/posts` - số bài theo tuần Thứ Hai-CN (bài không có ngày đăng KHÔNG tính - PLAN 3.3). */
    async posts(user: FanpageCaller, q: StatsRangeQueryDto): Promise<PostsStatsResponse> {
        const { from, to } = this.range(q);
        const pages = await this.scopedPages(user);
        const counts = new Map<string, number>();
        for (const batch of chunk(pages.map((p) => p.id), FANPAGE_BATCH_SIZE)) {
            const rows = await this.postRepo
                .createQueryBuilder('p')
                .select("DATE_FORMAT(p.posted_date, '%Y-%m-%d')", 'd')
                .addSelect('COUNT(*)', 'c')
                .where('p.fanpage_id IN (:...ids)', { ids: batch })
                .andWhere('p.posted_date BETWEEN :from AND :to', { from, to })
                .groupBy('p.posted_date')
                .getRawMany<{ d: string; c: string | number }>();
            for (const r of rows) counts.set(r.d, (counts.get(r.d) ?? 0) + Number(r.c));
        }
        const weeks = bucketPostsByWeek([...counts].map(([date, count]) => ({ date, count })), from, to);
        const weeklyTarget = pages
            .filter((p) => isTrackedPage({ isActive: p.isActive, archivedAt: p.archivedAt, healthIsBlocking: p.healthStatus?.isBlocking ?? null }))
            .reduce((sum, p) => sum + (p.targetPostsPerWeek ?? 0), 0);
        return { from, to, weeks, totalPosts: weeks.reduce((s, w) => s + w.count, 0), weeklyTarget };
    }

    /** `GET /fanpages/stats/top-posts` - xếp theo like + comment + share; chỉ bài ĐÃ nhập số liệu (bỏ NULL). */
    async topPosts(user: FanpageCaller, q: TopPostsQueryDto): Promise<TopPostsResponse> {
        const { from, to } = this.range(q);
        const limit = q.limit ?? 10;
        const pages = await this.scopedPages(user);
        const nameOf = new Map(pages.map((p) => [p.id, p.name]));

        const merged: RawTopPost[] = [];
        let postsWithoutMetrics = 0;
        for (const batch of chunk(pages.map((p) => p.id), FANPAGE_BATCH_SIZE)) {
            const base = () =>
                this.postRepo
                    .createQueryBuilder('p')
                    .where('p.fanpage_id IN (:...ids)', { ids: batch })
                    .andWhere('p.posted_date BETWEEN :from AND :to', { from, to });
            const hasMetric = '(p.likes IS NOT NULL OR p.comments IS NOT NULL OR p.shares IS NOT NULL OR p.views IS NOT NULL)';
            const [top, without] = await Promise.all([
                base()
                    .andWhere('(p.likes IS NOT NULL OR p.comments IS NOT NULL OR p.shares IS NOT NULL)')
                    .select('p.id', 'id')
                    .addSelect('p.fanpage_id', 'fanpageId')
                    .addSelect('p.title', 'title')
                    .addSelect('p.url', 'url')
                    .addSelect("DATE_FORMAT(p.posted_date, '%Y-%m-%d')", 'postedDate')
                    .addSelect('p.views', 'views')
                    .addSelect('p.likes', 'likes')
                    .addSelect('p.comments', 'comments')
                    .addSelect('p.shares', 'shares')
                    .addSelect('(COALESCE(p.likes, 0) + COALESCE(p.comments, 0) + COALESCE(p.shares, 0))', 'interactions')
                    .orderBy('interactions', 'DESC')
                    .addOrderBy('p.id', 'DESC')
                    .limit(limit)
                    .getRawMany<RawTopPost>(),
                base().andWhere(`NOT ${hasMetric}`).getCount(),
            ]);
            merged.push(...top);
            postsWithoutMetrics += without;
        }
        merged.sort((a, b) => Number(b.interactions) - Number(a.interactions) || Number(b.id) - Number(a.id));
        return {
            from,
            to,
            postsWithoutMetrics,
            posts: merged.slice(0, limit).map((r) => ({
                id: Number(r.id),
                fanpageId: Number(r.fanpageId),
                fanpageName: nameOf.get(Number(r.fanpageId)) ?? '',
                title: r.title,
                url: r.url,
                postedDate: r.postedDate,
                views: nOrNull(r.views),
                likes: nOrNull(r.likes),
                comments: nOrNull(r.comments),
                shares: nOrNull(r.shares),
                interactions: Number(r.interactions),
            })),
        };
    }

    /** `GET /fanpages/:id/heatmap?weeks=12` - chỉ `{date,count}` (quyền `fanpages.view` trên Page đó). */
    async heatmap(fanpageId: number, weeks: number | undefined, user: FanpageCaller): Promise<Heatmap> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        const today = todayVnStr();
        const empty = buildHeatmap([], today, weeks ?? 12);
        const rows = await this.postRepo
            .createQueryBuilder('p')
            .select("DATE_FORMAT(p.posted_date, '%Y-%m-%d')", 'd')
            .addSelect('COUNT(*)', 'c')
            .where('p.fanpage_id = :id', { id: fanpageId })
            .andWhere('p.posted_date BETWEEN :from AND :to', { from: empty.from, to: addDays(empty.to, 0) })
            .groupBy('p.posted_date')
            .getRawMany<{ d: string; c: string | number }>();
        return buildHeatmap(rows.map((r) => ({ date: r.d, count: Number(r.c) })), today, weeks ?? 12);
    }
}