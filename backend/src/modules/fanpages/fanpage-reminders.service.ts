import { Injectable, Logger } from '@nestjs/common';
import { getNowVn, todayVnStr, toVnDateStr } from '../../common/utils/date-vn.util';
import { NotificationsService } from '../notifications/notifications.service';
import { FanpageInsightsService, PageInsights } from './fanpage-insights.service';
import { FanpageScopedQuery } from './fanpage-scoped-query';
import { FanpageSettingsService } from './fanpage-settings.service';
import { weekStartOf } from './helpers/fanpage-cadence.helper';
import {
    currentSilentMilestone,
    effectiveSilentDays,
    isReminderHour,
    silentDedupeSuffix,
} from './helpers/fanpage-reminder.helper';

export interface RunFanpageRemindersResult {
    nowVnHour: number;
    todayVn: string;
    /** Đã qua giờ bắt đầu nhắc (17:00 VN) chưa - chưa tới giờ thì thoát sớm, KHÔNG query gì. */
    pastCutoff: boolean;
    dryRun: boolean;
    /** Số Page theo dõi đã xét. */
    candidatesChecked: number;
    silentPageIds: number[];
    atRiskPageIds: number[];
}

export interface RunFanpageRemindersOptions {
    /** true = chỉ liệt kê Page SẼ được nhắc, không ghi thông báo. */
    dryRun?: boolean;
    /** Chỉ dùng cho test: ghi đè giờ/ngày VN. */
    clock?: { hour: number; today: string };
}

const chunkBy = <T, K>(items: T[], key: (t: T) => K): Map<K, T[]> => {
    const m = new Map<K, T[]>();
    for (const it of items) {
        const k = key(it);
        const list = m.get(k);
        if (list) list.push(it);
        else m.set(k, [it]);
    }
    return m;
};

/**
 * Nhắc việc Fanpage (PLAN 9, GĐ3): `fanpage.silent` ở các mốc im lặng + `fanpage.weekly_at_risk` lần đầu trong tuần.
 *
 * ⚠️ Dự án chạy Vercel serverless -> KHÔNG tự chạy; phải được dịch vụ Uptime BÊN NGOÀI gọi định kỳ qua
 * `FanpagesCronController` (bảo vệ bằng CRON_SECRET) - mirror `PeriodicTaskRemindersService`. Vercel Hobby đã dùng đủ 2/2 cron.
 *
 * Idempotent: `dedupeSuffix` + `findEmittedEntityIds` -> gọi lặp bao nhiêu lần cũng chỉ 1 thông báo / Page / mốc (hoặc / tuần) / người.
 * Chỉ nhắc Page `isTracked`, chưa đăng hôm nay, và CHỈ sau 17:00 giờ VN (người phụ trách đã có cả ngày để đăng).
 */
@Injectable()
export class FanpageRemindersService {
    private readonly logger = new Logger(FanpageRemindersService.name);

    constructor(
        private readonly scoped: FanpageScopedQuery,
        private readonly insights: FanpageInsightsService,
        private readonly settings: FanpageSettingsService,
        private readonly notifications: NotificationsService,
    ) { }

    async runDueReminders(opts: RunFanpageRemindersOptions = {}): Promise<RunFanpageRemindersResult> {
        const dryRun = opts.dryRun === true;
        const nowVnHour = opts.clock?.hour ?? getNowVn().getHours();
        const todayVn = opts.clock?.today ?? todayVnStr();
        const empty: RunFanpageRemindersResult = {
            nowVnHour, todayVn, pastCutoff: false, dryRun, candidatesChecked: 0, silentPageIds: [], atRiskPageIds: [],
        };
        if (!isReminderHour(nowVnHour)) return empty;

        const pages = await this.scoped.loadTrackable();
        if (pages.length === 0) return { ...empty, pastCutoff: true };
        const [silentDays, map] = await Promise.all([
            this.settings.getSilentDays(),
            this.insights.forPages(pages, todayVn, { withNotes: false }),
        ]);

        interface Candidate {
            id: number;
            name: string;
            ownerIds: number[];
            ins: PageInsights;
            createdDate: string;
        }
        const tracked: Candidate[] = [];
        for (const p of pages) {
            const ins = map.get(p.id) as PageInsights;
            // Page đã đăng hôm nay không cần nhắc (chỉ cần MỘT người phụ trách đăng - PLAN 3.4).
            if (!ins.isTracked || ins.cadence.postedToday) continue;
            tracked.push({ id: p.id, name: p.name, ownerIds: (p.owners ?? []).map((o) => o.id), ins, createdDate: toVnDateStr(p.createdAt) });
        }

        // ── fanpage.silent: mốc cao nhất đã đạt; điểm neo = ngày bài gần nhất (hoặc ngày tạo Page nếu chưa từng đăng) ──
        const silentDue: Array<Candidate & { days: number; suffix: string }> = [];
        for (const c of tracked) {
            if (c.ins.cadence.state !== 'silent') continue;
            const days = effectiveSilentDays(todayVn, c.ins.lastPostDate, c.createdDate);
            const milestone = currentSilentMilestone(days, silentDays);
            if (milestone == null) continue;
            silentDue.push({ ...c, days, suffix: silentDedupeSuffix(c.ins.lastPostDate ?? c.createdDate, milestone) });
        }

        // ── fanpage.weekly_at_risk: lần đầu at_risk trong tuần (khoá = ngày Thứ Hai của tuần) ──
        const weekMonday = weekStartOf(todayVn);
        const atRiskDue = tracked.filter((c) => c.ins.cadence.state === 'at_risk');

        const result: RunFanpageRemindersResult = {
            nowVnHour, todayVn, pastCutoff: true, dryRun, candidatesChecked: tracked.length, silentPageIds: [], atRiskPageIds: [],
        };

        // Bỏ Page ĐÃ nhắc (Uptime gọi lặp) TRƯỚC khi gọi emitNow: tối ưu - emitNow vẫn tự dedupe bằng khoá duy nhất nên lỡ sót cũng không gửi trùng.
        // `findEmittedEntityIds` nhận 1 hậu tố chung -> gom theo hậu tố (số nhóm nhỏ: chỉ Page đang im lặng).
        const pendingSilent: typeof silentDue = [];
        for (const [suffix, group] of chunkBy(silentDue, (c) => c.suffix)) {
            const done = await this.notifications.findEmittedEntityIds('fanpage.silent', 'fanpage', group.map((g) => g.id), suffix);
            pendingSilent.push(...group.filter((g) => !done.has(g.id)));
        }
        const doneAtRisk = await this.notifications.findEmittedEntityIds('fanpage.weekly_at_risk', 'fanpage', atRiskDue.map((c) => c.id), weekMonday);
        const pendingAtRisk = atRiskDue.filter((c) => !doneAtRisk.has(c.id));

        result.silentPageIds = pendingSilent.map((c) => c.id);
        result.atRiskPageIds = pendingAtRisk.map((c) => c.id);
        if (dryRun) return result;

        for (const c of pendingSilent) {
            try {
                await this.notifications.emitNow({
                    type: 'fanpage.silent',
                    actorId: null,
                    entity: { type: 'fanpage', id: c.id },
                    entityName: c.name,
                    recipients: { fanpage: { ownerIds: c.ownerIds } },
                    params: { days: c.days },
                    dedupeSuffix: c.suffix,
                });
            } catch (error) {
                const err = error as Error;
                this.logger.error(`Gửi nhắc im lặng thất bại (fanpageId=${c.id}): ${err?.message}`, err?.stack);
            }
        }
        for (const c of pendingAtRisk) {
            try {
                await this.notifications.emitNow({
                    type: 'fanpage.weekly_at_risk',
                    actorId: null,
                    entity: { type: 'fanpage', id: c.id },
                    entityName: c.name,
                    recipients: { fanpage: { ownerIds: c.ownerIds } },
                    params: { weekCount: c.ins.cadence.weekCount, ...(c.ins.cadence.target != null ? { target: c.ins.cadence.target } : {}) },
                    dedupeSuffix: weekMonday,
                });
            } catch (error) {
                const err = error as Error;
                this.logger.error(`Gửi nhắc nguy cơ trễ tuần thất bại (fanpageId=${c.id}): ${err?.message}`, err?.stack);
            }
        }
        return result;
    }
}