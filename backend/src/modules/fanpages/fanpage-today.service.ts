import { Injectable } from '@nestjs/common';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FanpageInsightsService, PageInsights } from './fanpage-insights.service';
import { FanpageScopedQuery, requireViewScope } from './fanpage-scoped-query';
import { CadenceResult, daysLeftInWeek } from './helpers/fanpage-cadence.helper';
import { groupToday, TodayGroups } from './helpers/fanpage-today.helper';

/** 1 dòng ở tab \"Hôm nay\" - CHỈ trường tab cần (không kéo cả `FanpageView`). */
export interface FanpageTodayItem {
    id: number;
    name: string;
    url: string;
    platform: { id: number; name: string; color: string; isActive: boolean };
    ownerId: number | null;
    owners: Array<{ id: number; name: string }>;
    health: { id: number; name: string; color: string } | null;
    lastPostDate: string | null;
    posts30d: number;
    cadence: CadenceResult;
    isTracked: boolean;
    /** Người xem được thêm bài cho Page này không (BE tính theo scope `fanpage_posts.manage`) - FE ẩn nút \"+ Thêm bài\" theo đây. */
    canManagePosts: boolean;
}

export interface FanpageTodayResponse extends TodayGroups<FanpageTodayItem> {
    /** Hôm nay theo giờ VN (YYYY-MM-DD) - FE không tự lấy giờ máy. */
    today: string;
    /** Số ngày còn lại của tuần tính cả hôm nay (Thứ Hai = 7, Chủ Nhật = 1). */
    daysLeftInWeek: number;
    counts: { needAction: number; postedToday: number; ok: number };
}

/**
 * Tab \"Hôm nay\" + số cho badge sidebar (PLAN 8.4, GĐ3). Cùng `FanpageScopedQuery` + `FanpageInsightsService` với danh sách/overview
 * nên Page tô đỏ ở bảng LUÔN có mặt ở đây (X2/X3); phân nhóm do `fanpage-today.helper` (hàm thuần) quyết định.
 * Không cache riêng: sau khi thêm bài, thẻ phải chuyển nhóm ngay (badge sidebar đã có cache 60s + xoá cache khi có request ghi).
 */
@Injectable()
export class FanpageTodayService {
    constructor(
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
        private readonly insights: FanpageInsightsService,
    ) { }

    private toItem(page: Fanpage, ins: PageInsights, canManagePosts: boolean): FanpageTodayItem {
        const platform = page.platform;
        const health = page.healthStatus;
        return {
            id: page.id,
            name: page.name,
            url: page.url,
            platform: { id: platform.id, name: platform.name, color: platform.color, isActive: platform.isActive },
            ownerId: page.ownerId ?? null,
            owners: (page.owners ?? []).map((o) => ({ id: o.id, name: o.name })),
            health: health ? { id: health.id, name: health.name, color: health.color } : null,
            lastPostDate: ins.lastPostDate,
            posts30d: ins.posts30d,
            cadence: ins.cadence,
            isTracked: ins.isTracked,
            canManagePosts,
        };
    }

    async today(user: FanpageCaller): Promise<FanpageTodayResponse> {
        const scopes = await this.access.resolveScopes(user);
        requireViewScope(scopes);
        const today = todayVnStr();
        const pages = await this.scoped.load(user, scopes, { archived: 'false' });
        // Không cần đếm ghi chú -> mỗi lô chỉ 1 SQL.
        const map = await this.insights.forPages(pages, today, { withNotes: false });
        const items = pages.map((p) => this.toItem(p, map.get(p.id) as PageInsights, this.access.flagsFor(p, user.id, scopes).canManagePosts));
        const g = groupToday(items);
        return {
            today,
            daysLeftInWeek: daysLeftInWeek(today),
            ...g,
            counts: { needAction: g.needAction.length, postedToday: g.postedToday.length, ok: g.ok.length },
        };
    }

    /**
     * Số Page \"cần hành động\" cho badge sidebar = đúng độ dài nhóm `needAction` của `today()` (X2/X16).
     * Không có quyền xem Page -> 0 (không ném 403: badge gọi theo lô, SidebarBadgesService đã kiểm `fanpages.view`).
     */
    async countNeedAction(user: FanpageCaller): Promise<number> {
        const scopes = await this.access.resolveScopes(user);
        if (scopes.view !== 'own' && scopes.view !== 'department' && scopes.view !== 'all') return 0;
        const today = todayVnStr();
        const pages = await this.scoped.load(user, scopes, { archived: 'false' });
        if (pages.length === 0) return 0;
        const map = await this.insights.forPages(pages, today, { withNotes: false });
        return groupToday(pages.map((p) => map.get(p.id) as PageInsights)).needAction.length;
    }
}