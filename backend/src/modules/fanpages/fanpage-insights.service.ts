import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { FanpageNote } from '../../database/entities/fanpage-note.entity';
import { todayVnStr, toVnDateStr } from '../../common/utils/date-vn.util';
import { FanpageSettingsService } from './fanpage-settings.service';
import {
    CadenceResult,
    computeCadence,
    FANPAGE_POSTS_WINDOW_DAYS,
    isTrackedPage,
    weekEndOf,
    weekStartOf,
    windowStartOf,
} from './helpers/fanpage-cadence.helper';

/** Số ID tối đa mỗi lần chạy truy vấn gộp (PLAN 6.2) - danh sách có thể lên hàng trăm Page. */
export const FANPAGE_BATCH_SIZE = 500;

export interface PostAggregate {
    /** Mọi bài của Page (kể cả bài chưa có ngày đăng). */
    postCount: number;
    noteCount: number;
    /** Ngày đăng gần nhất (bài có posted_date <= hôm nay). */
    lastPostDate: string | null;
    /** Bài có posted_date trong 30 ngày gần nhất (gồm hôm nay). */
    posts30d: number;
    /** Bài có posted_date trong tuần Thứ Hai-CN hiện tại. */
    weekCount: number;
}

export interface RawPostAggregate extends PostAggregate {
    /** Các ngày có bài trong 30 ngày gần nhất - chỉ để tính streak, KHÔNG trả ra API. */
    recentPostDates: string[];
}

export interface PageInsights extends PostAggregate {
    isTracked: boolean;
    isOrphan: boolean;
    cadence: CadenceResult;
}

export const EMPTY_AGGREGATE: RawPostAggregate = { postCount: 0, noteCount: 0, lastPostDate: null, posts30d: 0, weekCount: 0, recentPostDates: [] };

/** "Mồ côi" = không còn người phụ trách nào đang hoạt động (chưa có ai, hoặc tất cả đã nghỉ/bị khoá). Hàm thuần. */
export function isOrphanPage(owners: ReadonlyArray<{ isActive?: boolean }> | undefined | null): boolean {
    if (!owners || owners.length === 0) return true;
    return owners.every((o) => o.isActive === false);
}

export interface BuildInsightsCtx {
    today: string;
    silentDays: number;
}

type PageForInsights = Pick<Fanpage, 'isActive' | 'archivedAt' | 'targetPostsPerWeek' | 'createdAt' | 'owners'> & {
    healthStatus?: { isBlocking: boolean } | null;
};

/** Gộp thuộc tính Page + số liệu bài -> `PageInsights`. Hàm thuần, KHÔNG chạm DB/đồng hồ (có test). */
export function buildInsights(page: PageForInsights, agg: RawPostAggregate, ctx: BuildInsightsCtx): PageInsights {
    const isTracked = isTrackedPage({
        isActive: page.isActive,
        archivedAt: page.archivedAt,
        healthIsBlocking: page.healthStatus?.isBlocking ?? null,
    });
    const cadence = computeCadence({
        today: ctx.today,
        isTracked,
        lastPostDate: agg.lastPostDate,
        weekCount: agg.weekCount,
        target: page.targetPostsPerWeek ?? null,
        silentDays: ctx.silentDays,
        createdDate: toVnDateStr(page.createdAt),
        recentPostDates: agg.recentPostDates,
    });
    const { recentPostDates: _drop, ...pub } = agg;
    void _drop;
    return { ...pub, isTracked, isOrphan: isOrphanPage(page.owners), cadence };
}

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

interface RawPostRow {
    fanpageId: number | string;
    postCount: string | number;
    lastPostDate: string | null;
    posts30d: string | number | null;
    weekCount: string | number | null;
    recentDates: string | null;
}

/**
 * Tính `PageInsights` cho 1 danh sách Page bằng TRUY VẤN GỘP theo `fanpage_id IN (...)` (PLAN X17, 6.5):
 * đúng 2 câu SQL cho mỗi lô 500 Page (bài + ghi chú) - thay cho 2 `loadRelationCountAndMap` cũ nên số query KHÔNG tăng.
 * Không JOIN thêm vào query chính của danh sách (JOIN `owners` đã nhân dòng).
 */
@Injectable()
export class FanpageInsightsService {
    constructor(
        @InjectRepository(FanpagePost)
        private readonly postRepo: Repository<FanpagePost>,
        @InjectRepository(FanpageNote)
        private readonly noteRepo: Repository<FanpageNote>,
        private readonly settings: FanpageSettingsService,
    ) { }

    async forPages(pages: ReadonlyArray<PageForInsights & { id: number }>, today: string = todayVnStr()): Promise<Map<number, PageInsights>> {
        const silentDays = await this.settings.getSilentDays();
        const aggregates = await this.aggregate(
            pages.map((p) => p.id),
            today,
        );
        const out = new Map<number, PageInsights>();
        for (const p of pages) out.set(p.id, buildInsights(p, aggregates.get(p.id) ?? EMPTY_AGGREGATE, { today, silentDays }));
        return out;
    }

    async aggregate(ids: number[], today: string): Promise<Map<number, RawPostAggregate>> {
        const result = new Map<number, RawPostAggregate>();
        if (ids.length === 0) return result;

        const params = {
            today,
            from30: windowStartOf(today, FANPAGE_POSTS_WINDOW_DAYS),
            weekStart: weekStartOf(today),
            weekEnd: weekEndOf(today),
        };

        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            const [postRows, noteRows] = await Promise.all([
                this.postRepo
                    .createQueryBuilder('p')
                    .select('p.fanpageId', 'fanpageId')
                    .addSelect('COUNT(*)', 'postCount')
                    .addSelect("DATE_FORMAT(MAX(CASE WHEN p.posted_date <= :today THEN p.posted_date END), '%Y-%m-%d')", 'lastPostDate')
                    .addSelect('SUM(CASE WHEN p.posted_date BETWEEN :from30 AND :today THEN 1 ELSE 0 END)', 'posts30d')
                    .addSelect('SUM(CASE WHEN p.posted_date BETWEEN :weekStart AND :weekEnd THEN 1 ELSE 0 END)', 'weekCount')
                    .addSelect(
                        "GROUP_CONCAT(DISTINCT CASE WHEN p.posted_date BETWEEN :from30 AND :today THEN DATE_FORMAT(p.posted_date, '%Y-%m-%d') END)",
                        'recentDates',
                    )
                    .where('p.fanpage_id IN (:...ids)', { ids: batch })
                    .setParameters(params)
                    .groupBy('p.fanpage_id')
                    .getRawMany<RawPostRow>(),
                this.noteRepo
                    .createQueryBuilder('n')
                    .select('n.fanpageId', 'fanpageId')
                    .addSelect('COUNT(*)', 'noteCount')
                    .where('n.fanpage_id IN (:...ids)', { ids: batch })
                    .groupBy('n.fanpage_id')
                    .getRawMany<{ fanpageId: number | string; noteCount: string | number }>(),
            ]);

            for (const r of postRows) {
                result.set(Number(r.fanpageId), {
                    postCount: Number(r.postCount),
                    noteCount: 0,
                    lastPostDate: r.lastPostDate ?? null,
                    posts30d: Number(r.posts30d ?? 0),
                    weekCount: Number(r.weekCount ?? 0),
                    recentPostDates: r.recentDates ? r.recentDates.split(',') : [],
                });
            }
            for (const r of noteRows) {
                const id = Number(r.fanpageId);
                const cur = result.get(id) ?? { ...EMPTY_AGGREGATE };
                cur.noteCount = Number(r.noteCount);
                result.set(id, cur);
            }
        }
        return result;
    }
}