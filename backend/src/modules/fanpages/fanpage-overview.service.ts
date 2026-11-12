import { Injectable } from '@nestjs/common';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FanpageInsightsService, PageInsights } from './fanpage-insights.service';
import { FanpageMetricsService } from './fanpage-metrics.service';
import { FanpageScopedQuery, requireViewScope } from './fanpage-scoped-query';
import { windowGain } from './helpers/fanpage-metrics.helper';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { addDays } from '../utms/helpers/utm-stats.helper';

export interface FanpageOverview {
    /** Page không lưu trữ trong phạm vi của người gọi (gồm cả tạm ngừng/bị chặn) - khớp số dòng tab "Danh sách" mặc định. */
    totalPages: number;
    /** Page `isTracked` (PLAN 3.1) - mẫu số của mọi con số bên dưới. */
    trackedPages: number;
    pausedPages: number;
    newPages: number;
    okPages: number;
    atRiskPages: number;
    silentPages: number;
    /** Page `isTracked` đã có bài hôm nay. */
    postedTodayPages: number;
    /** Page "mồ côi" (không còn người phụ trách hoạt động) trong số Page không lưu trữ. */
    orphanPages: number;
    /** Số Page đã lưu trữ trong phạm vi (badge tab "Đã lưu trữ"). */
    archivedPages: number;
    /** Tổng bài trong tuần Thứ Hai-CN hiện tại / 30 ngày gần nhất - CHỈ Page isTracked. */
    postsThisWeek: number;
    posts30d: number;
    /** Follower tăng/giảm 30 ngày (số liệu nhập tay) - chỉ cộng Page ĐỦ ≥ 2 mốc để so (PLAN 3.6); null = chưa Page nào đủ. */
    followerGain30d: number | null;
    /** Page isTracked chưa có số liệu follower nào - ghi chú dưới thẻ KPI "N Page chưa có số liệu". */
    pagesWithoutMetrics: number;
}

type OverviewCore = Omit<FanpageOverview, 'archivedPages' | 'followerGain30d' | 'pagesWithoutMetrics'>;

/** Cộng dồn KPI từ danh sách Page đã tính nhịp đăng. Hàm thuần (có test): thẻ KPI và bảng luôn đọc cùng 1 nguồn. */
export function summarizeOverview(rows: ReadonlyArray<{ insights: PageInsights }>): OverviewCore {
    const o: OverviewCore = {
        totalPages: rows.length,
        trackedPages: 0,
        pausedPages: 0,
        newPages: 0,
        okPages: 0,
        atRiskPages: 0,
        silentPages: 0,
        postedTodayPages: 0,
        orphanPages: 0,
        postsThisWeek: 0,
        posts30d: 0,
    };
    for (const { insights: i } of rows) {
        if (i.isOrphan) o.orphanPages++;
        if (!i.isTracked) {
            o.pausedPages++;
            continue;
        }
        o.trackedPages++;
        o.postsThisWeek += i.weekCount;
        o.posts30d += i.posts30d;
        if (i.cadence.postedToday) o.postedTodayPages++;
        switch (i.cadence.state) {
            case 'new':
                o.newPages++;
                break;
            case 'silent':
                o.silentPages++;
                break;
            case 'at_risk':
                o.atRiskPages++;
                break;
            case 'ok':
                o.okPages++;
                break;
            default:
                break; // 'paused' đã xử lý ở trên (isTracked = false)
        }
    }
    return o;
}

/** `GET /fanpages/overview` - số cho thẻ KPI. Cùng `FanpageScopedQuery` + `FanpageInsightsService` với danh sách (X3). */
@Injectable()
export class FanpageOverviewService {
    constructor(
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
        private readonly insights: FanpageInsightsService,
        private readonly metrics: FanpageMetricsService,
    ) { }

    async overview(user: FanpageCaller): Promise<FanpageOverview> {
        const scopes = await this.access.resolveScopes(user);
        requireViewScope(scopes);
        const [pages, archivedPages] = await Promise.all([
            this.scoped.load(user, scopes, { archived: 'false' }),
            this.scoped.countArchived(user, scopes),
        ]);
        const map = await this.insights.forPages(pages);
        const rows = pages.map((p) => ({ insights: map.get(p.id) as PageInsights }));

        // Follower 30 ngày: chỉ Page đang theo dõi (cùng mẫu số với các KPI khác).
        const trackedIds = pages.filter((p) => (map.get(p.id) as PageInsights).isTracked).map((p) => p.id);
        const today = todayVnStr();
        const from = addDays(today, -29);
        const series = await this.metrics.followerSeries(trackedIds, from, today);
        let gainTotal = 0;
        let pagesWithGain = 0;
        let pagesWithoutMetrics = 0;
        for (const id of trackedIds) {
            const rowsOfPage = series.get(id) ?? [];
            if (rowsOfPage.length === 0) pagesWithoutMetrics++;
            const g = windowGain(rowsOfPage, from, today);
            if (g) {
                gainTotal += g.gain;
                pagesWithGain++;
            }
        }
        return { ...summarizeOverview(rows), archivedPages, followerGain30d: pagesWithGain > 0 ? gainTotal : null, pagesWithoutMetrics };
    }
}