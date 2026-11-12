import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpageMetricSnapshot } from '../../database/entities/fanpage-metric-snapshot.entity';
import { FanpageTarget } from '../../database/entities/fanpage-target.entity';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { isValidDateStr } from '../utms/helpers/utm-stats.helper';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { AuditService } from '../audit/audit.service';
import { BulkSnapshotDto, MetricValuesDto, SetTargetDto, SnapshotListQueryDto, UpsertSnapshotDto } from './dto/fanpage-metrics.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FANPAGE_BATCH_SIZE } from './fanpage-insights.service';
import { FanpageScopedQuery, requireViewScope } from './fanpage-scoped-query';
import { isTrackedPage } from './helpers/fanpage-cadence.helper';
import {
    DatedValue,
    LatestMetric,
    METRIC_KEYS,
    MetricInput,
    MetricKey,
    isSuspiciousDrop,
    isValidMonth,
    latestFollowerMetric,
    monthEnd,
    monthStart,
    validateSnapshot,
    windowGain,
} from './helpers/fanpage-metrics.helper';

const blankToNull = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim());

const isDuplicateKey = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && ((err as { code?: string }).code === 'ER_DUP_ENTRY' || (err as { errno?: number }).errno === 1062);

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

export interface SnapshotView {
    id: number;
    fanpageId: number;
    snapshotDate: string;
    followers: number | null;
    reach: number | null;
    engagement: number | null;
    views: number | null;
    note: string | null;
    createdBy: { id: number; name: string } | null;
    updatedBy: { id: number; name: string } | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface GridRow {
    fanpageId: number;
    name: string;
    url: string;
    platform: { id: number; name: string; color: string };
    /** Dòng đúng ngày đang nhập (nếu đã có) - FE gửi lại `updatedAt` làm `expectedUpdatedAt` khi lưu (X24). */
    current: Pick<SnapshotView, 'followers' | 'reach' | 'engagement' | 'views' | 'note' | 'updatedAt'> | null;
    /** Lần nhập gần nhất TRƯỚC ngày đang nhập (hiện mờ cạnh ô để so sánh). */
    previous: (Pick<SnapshotView, 'followers' | 'reach' | 'engagement' | 'views'> & { date: string }) | null;
}

export type SaveErrorCode = 'INVALID' | 'STALE' | 'SUSPICIOUS_DROP';

export interface BulkRowError {
    fanpageId: number;
    code: 'NO_ACCESS' | SaveErrorCode;
    message: string;
    /** Chỉ có ở STALE: `updatedAt` hiện tại của dòng để FE hỏi "Ghi đè?" rồi gửi lại. */
    currentUpdatedAt?: Date | null;
}

export interface TargetView {
    month: string;
    targetFollowerGain: number | null;
    /** Follower đã tăng trong tháng (theo số liệu nhập tay); null = chưa đủ số liệu để so. */
    actualGain: number | null;
}

type RawFollowerRow = { fanpageId: number | string; d: string; v: number | string };

type SaveResult =
    | { ok: true; id: number; updatedAt: Date }
    | { ok: false; code: SaveErrorCode; message: string; currentUpdatedAt?: Date | null };

/**
 * Số liệu định kỳ nhập tay (C1/C2/C5): upsert 1 dòng/(Page, ngày), lưới nhập nhanh, mục tiêu tháng.
 * Lưới và Drawer gọi CÙNG `saveRow` (X7). Mọi ngày là chuỗi YYYY-MM-DD giờ VN (không qua `Date` -> không dính múi giờ).
 */
@Injectable()
export class FanpageMetricsService {
    constructor(
        @InjectRepository(FanpageMetricSnapshot)
        private readonly repo: Repository<FanpageMetricSnapshot>,
        @InjectRepository(FanpageTarget)
        private readonly targetRepo: Repository<FanpageTarget>,
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
        private readonly auditService: AuditService,
    ) { }

    // ───────────── Đọc (dùng chung cho list / overview / stats) ─────────────

    /**
     * Follower nhập tay của nhiều Page cho kỳ [from, to]: mỗi Page = dòng TĂNG dần theo ngày, GỒM mốc nền gần nhất TRƯỚC `from`
     * (để carry-forward / tính tăng trưởng). 2 truy vấn gộp mỗi lô 500 Page, không JOIN theo từng Page.
     */
    async followerSeries(ids: number[], from: string, to: string): Promise<Map<number, DatedValue[]>> {
        const out = new Map<number, DatedValue[]>();
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            const marks = batch.map(() => '?').join(',');
            const [inRange, baseline] = await Promise.all([
                this.repo.query(
                    `SELECT fanpage_id AS fanpageId, DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS d, followers AS v
                     FROM fanpage_metric_snapshots
                     WHERE fanpage_id IN (${marks}) AND followers IS NOT NULL AND snapshot_date BETWEEN ? AND ?`,
                    [...batch, from, to],
                ) as Promise<RawFollowerRow[]>,
                this.repo.query(
                    `SELECT s.fanpage_id AS fanpageId, DATE_FORMAT(s.snapshot_date, '%Y-%m-%d') AS d, s.followers AS v
                     FROM fanpage_metric_snapshots s
                     INNER JOIN (
                       SELECT fanpage_id, MAX(snapshot_date) AS md FROM fanpage_metric_snapshots
                       WHERE fanpage_id IN (${marks}) AND followers IS NOT NULL AND snapshot_date < ?
                       GROUP BY fanpage_id
                     ) m ON m.fanpage_id = s.fanpage_id AND m.md = s.snapshot_date`,
                    [...batch, from],
                ) as Promise<RawFollowerRow[]>,
            ]);
            for (const r of [...baseline, ...inRange]) {
                const id = Number(r.fanpageId);
                const list = out.get(id) ?? [];
                list.push({ date: r.d, value: Number(r.v) });
                out.set(id, list);
            }
        }
        for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
        return out;
    }

    /** Follower mới nhất + chênh lệch so với lần nhập trước (kèm số ngày cách nhau) cho cột "Followers" của danh sách. */
    async latestFollowers(ids: number[]): Promise<Map<number, LatestMetric>> {
        const out = new Map<number, LatestMetric>();
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            if (batch.length === 0) continue;
            const marks = batch.map(() => '?').join(',');
            const rows = (await this.repo.query(
                `SELECT t.fanpage_id AS fanpageId, DATE_FORMAT(t.snapshot_date, '%Y-%m-%d') AS d, t.followers AS v, t.rn AS rn
                 FROM (
                   SELECT s.fanpage_id, s.snapshot_date, s.followers,
                          ROW_NUMBER() OVER (PARTITION BY s.fanpage_id ORDER BY s.snapshot_date DESC) AS rn
                   FROM fanpage_metric_snapshots s
                   WHERE s.fanpage_id IN (${marks}) AND s.followers IS NOT NULL
                 ) t WHERE t.rn <= 2`,
                batch,
            )) as Array<RawFollowerRow & { rn: number | string }>;
            const latest = new Map<number, DatedValue>();
            const previous = new Map<number, DatedValue>();
            for (const r of rows) {
                const target = Number(r.rn) === 1 ? latest : previous;
                target.set(Number(r.fanpageId), { date: r.d, value: Number(r.v) });
            }
            for (const [id, l] of latest) {
                const m = latestFollowerMetric(l, previous.get(id) ?? null);
                if (m) out.set(id, m);
            }
        }
        return out;
    }

    // ───────────── Danh sách / lưu / xoá 1 dòng ─────────────

    async list(fanpageId: number, user: FanpageCaller, q: SnapshotListQueryDto = {}): Promise<SnapshotView[]> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        if ((q.from && !isValidDateStr(q.from)) || (q.to && !isValidDateStr(q.to))) throw new BadRequestException('Ngày không hợp lệ');
        const qb = this.repo
            .createQueryBuilder('s')
            .leftJoin('s.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .leftJoin('s.updatedBy', 'updatedBy')
            .addSelect(['updatedBy.id', 'updatedBy.name'])
            .where('s.fanpageId = :fanpageId', { fanpageId });
        if (q.from) qb.andWhere('s.snapshotDate >= :from', { from: q.from });
        if (q.to) qb.andWhere('s.snapshotDate <= :to', { to: q.to });
        // Trần 400 dòng (~13 tháng nhập hằng ngày); muốn xa hơn thì lọc theo from/to.
        return (await qb.orderBy('s.snapshotDate', 'DESC').take(400).getMany()) as SnapshotView[];
    }

    /** `PUT /fanpages/:id/snapshots/:date` - upsert 1 dòng (Drawer). Không gửi `expectedUpdatedAt` = ghi đè. */
    async upsert(fanpageId: number, date: string, dto: UpsertSnapshotDto, user: FanpageCaller): Promise<SnapshotView> {
        const page = await this.access.assertPageAccess(user, 'fanpage_metrics.manage', fanpageId, 'Bạn không có quyền nhập số liệu cho Page này');
        this.assertNotArchived(page);
        const result = await this.saveRow(fanpageId, date, dto, user);
        if (!result.ok) {
            if (result.code === 'STALE') {
                throw new ConflictException({ code: 'FANPAGE_SNAPSHOT_STALE', message: result.message, currentUpdatedAt: result.currentUpdatedAt ?? null });
            }
            if (result.code === 'SUSPICIOUS_DROP') {
                throw new ConflictException({ code: 'FANPAGE_SNAPSHOT_SUSPICIOUS_DROP', message: result.message });
            }
            throw new BadRequestException(result.message);
        }
        return this.getView(result.id);
    }

    async remove(fanpageId: number, date: string, user: FanpageCaller): Promise<{ deleted: true }> {
        await this.access.assertPageAccess(user, 'fanpage_metrics.delete', fanpageId, 'Bạn không có quyền xoá số liệu của Page này');
        if (!isValidDateStr(date)) throw new BadRequestException('Ngày không hợp lệ');
        const row = await this.repo.findOne({ where: { fanpageId, snapshotDate: date } });
        if (!row) throw new NotFoundException('Không có số liệu ở ngày này');
        const snap = this.auditShape(row);
        await this.repo.delete(row.id);
        this.auditService.logActionAsync(user.id, 'DELETE_FANPAGE_SNAPSHOT', 'fanpage_snapshot', row.id, snap, null);
        return { deleted: true };
    }

    // ───────────── Lưới nhập nhanh ─────────────

    /**
     * `GET /fanpage-metrics/grid?date=` - Page người gọi được nhập số liệu (scope `fanpage_metrics.manage`), CHỈ Page đang theo dõi,
     * kèm dòng của ngày đang nhập + lần nhập trước. Dùng chung `FanpageScopedQuery` (X3) với scope của permission nhập liệu.
     */
    async grid(user: FanpageCaller, dateParam?: string): Promise<{ date: string; rows: GridRow[] }> {
        const date = dateParam ?? todayVnStr();
        if (!isValidDateStr(date)) throw new BadRequestException('Ngày không hợp lệ');
        const pages = await this.managedPages(user);
        const ids = pages.map((p) => p.id);
        const [current, previous] = await Promise.all([this.currentRows(ids, date), this.previousRows(ids, date)]);
        const rows: GridRow[] = pages
            .map((p) => {
                const cur = current.get(p.id);
                return {
                    fanpageId: p.id,
                    name: p.name,
                    url: p.url,
                    platform: { id: p.platform.id, name: p.platform.name, color: p.platform.color },
                    current: cur
                        ? { followers: cur.followers, reach: cur.reach, engagement: cur.engagement, views: cur.views, note: cur.note, updatedAt: cur.updatedAt }
                        : null,
                    previous: previous.get(p.id) ?? null,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        return { date, rows };
    }

    /**
     * `PUT /fanpage-metrics/bulk` - lưu nhiều dòng; lỗi trả THEO TỪNG DÒNG (không bỏ cả lô), dòng hợp lệ vẫn lưu.
     * Page ngoài phạm vi nhập liệu / lưu trữ / không theo dõi -> NO_ACCESS cho dòng đó (không lộ Page có tồn tại hay không).
     */
    async bulk(dto: BulkSnapshotDto, user: FanpageCaller): Promise<{ date: string; saved: Array<{ fanpageId: number; updatedAt: Date }>; errors: BulkRowError[] }> {
        if (!isValidDateStr(dto.date)) throw new BadRequestException('Ngày không hợp lệ');
        const allowed = new Set((await this.managedPages(user)).map((p) => p.id));
        const saved: Array<{ fanpageId: number; updatedAt: Date }> = [];
        const errors: BulkRowError[] = [];
        const seen = new Set<number>();
        for (const row of dto.rows) {
            if (seen.has(row.fanpageId)) {
                errors.push({ fanpageId: row.fanpageId, code: 'INVALID', message: 'Page xuất hiện nhiều lần trong cùng lần lưu' });
                continue;
            }
            seen.add(row.fanpageId);
            if (!allowed.has(row.fanpageId)) {
                errors.push({ fanpageId: row.fanpageId, code: 'NO_ACCESS', message: 'Bạn không thể nhập số liệu cho Page này' });
                continue;
            }
            const r = await this.saveRow(row.fanpageId, dto.date, row, user);
            if (r.ok) saved.push({ fanpageId: row.fanpageId, updatedAt: r.updatedAt });
            else errors.push({ fanpageId: row.fanpageId, code: r.code, message: r.message, currentUpdatedAt: r.currentUpdatedAt });
        }
        return { date: dto.date, saved, errors };
    }

    // ───────────── Mục tiêu tháng (C5) ─────────────

    /** Mục tiêu follower/tháng (24 tháng gần nhất) kèm số đã tăng thực tế. CHỈ để báo cáo - không kích hoạt nhắc (X8). */
    async listTargets(fanpageId: number, user: FanpageCaller): Promise<TargetView[]> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');
        const targets = await this.targetRepo.find({ where: { fanpageId }, order: { month: 'DESC' }, take: 24 });
        if (targets.length === 0) return [];
        const today = todayVnStr();
        const oldest = targets[targets.length - 1].month;
        const series = (await this.followerSeries([fanpageId], monthStart(oldest), today)).get(fanpageId) ?? [];
        return targets.map((t) => {
            const end = monthEnd(t.month);
            const gain = windowGain(series, monthStart(t.month), end > today ? today : end);
            return { month: t.month, targetFollowerGain: t.targetFollowerGain, actualGain: gain?.gain ?? null };
        });
    }

    /** `PUT /fanpages/:id/targets/:month` - đặt/đổi/bỏ (null) mục tiêu. */
    async setTarget(fanpageId: number, month: string, dto: SetTargetDto, user: FanpageCaller): Promise<{ month: string; targetFollowerGain: number | null }> {
        const page = await this.access.assertPageAccess(user, 'fanpage_metrics.manage', fanpageId, 'Bạn không có quyền đặt mục tiêu cho Page này');
        this.assertNotArchived(page);
        if (!isValidMonth(month)) throw new BadRequestException('Tháng phải có dạng YYYY-MM');
        const existing = await this.targetRepo.findOne({ where: { fanpageId, month } });

        if (dto.targetFollowerGain == null) {
            if (existing) {
                await this.targetRepo.delete(existing.id);
                this.auditService.logActionAsync(
                    user.id,
                    'SET_FANPAGE_TARGET',
                    'fanpage_target',
                    existing.id,
                    { fanpageId, month, targetFollowerGain: existing.targetFollowerGain },
                    { fanpageId, month, targetFollowerGain: null },
                );
            }
            return { month, targetFollowerGain: null };
        }
        const before = existing ? { fanpageId, month, targetFollowerGain: existing.targetFollowerGain } : null;
        try {
            const saved = await this.targetRepo.save(
                existing
                    ? Object.assign(existing, { targetFollowerGain: dto.targetFollowerGain, updatedById: user.id })
                    : this.targetRepo.create({ fanpageId, month, targetFollowerGain: dto.targetFollowerGain, createdById: user.id, updatedById: user.id }),
            );
            this.auditService.logActionAsync(user.id, 'SET_FANPAGE_TARGET', 'fanpage_target', saved.id, before, { fanpageId, month, targetFollowerGain: dto.targetFollowerGain });
        } catch (err) {
            if (!isDuplicateKey(err)) throw err;
            // 2 người đặt cùng lúc: UNIQUE chặn người sau -> cập nhật đè (cùng ý nghĩa "đặt mục tiêu").
            await this.targetRepo.update({ fanpageId, month }, { targetFollowerGain: dto.targetFollowerGain, updatedById: user.id });
        }
        return { month, targetFollowerGain: dto.targetFollowerGain };
    }

    // ───────────── Nội bộ ─────────────

    private assertNotArchived(page: Fanpage): void {
        if (page.archivedAt) throw new ConflictException('Page đã lưu trữ — bỏ lưu trữ trước khi nhập số liệu');
    }

    /** Page đang theo dõi trong phạm vi `fanpage_metrics.manage` (không lưu trữ, tình trạng không chặn). */
    private async managedPages(user: FanpageCaller): Promise<Fanpage[]> {
        const scopes = await this.access.scopesForKey(user, 'fanpage_metrics.manage');
        requireViewScope(scopes);
        const pages = await this.scoped.load(user, scopes, { archived: 'false' });
        return pages.filter((p) => isTrackedPage({ isActive: p.isActive, archivedAt: p.archivedAt, healthIsBlocking: p.healthStatus?.isBlocking ?? null }));
    }

    private async currentRows(ids: number[], date: string): Promise<Map<number, FanpageMetricSnapshot>> {
        const out = new Map<number, FanpageMetricSnapshot>();
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            if (batch.length === 0) continue;
            const rows = await this.repo
                .createQueryBuilder('s')
                .where('s.fanpageId IN (:...ids)', { ids: batch })
                .andWhere('s.snapshotDate = :date', { date })
                .getMany();
            for (const r of rows) out.set(r.fanpageId, r);
        }
        return out;
    }

    /** Dòng gần nhất TRƯỚC `date` của mỗi Page (1 truy vấn cửa sổ mỗi lô). */
    private async previousRows(ids: number[], date: string): Promise<Map<number, NonNullable<GridRow['previous']>>> {
        const out = new Map<number, NonNullable<GridRow['previous']>>();
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            if (batch.length === 0) continue;
            const marks = batch.map(() => '?').join(',');
            const rows = (await this.repo.query(
                `SELECT t.fanpage_id AS fanpageId, DATE_FORMAT(t.snapshot_date, '%Y-%m-%d') AS d,
                        t.followers, t.reach, t.engagement, t.views
                 FROM (
                   SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.fanpage_id ORDER BY s.snapshot_date DESC) AS rn
                   FROM fanpage_metric_snapshots s
                   WHERE s.fanpage_id IN (${marks}) AND s.snapshot_date < ?
                 ) t WHERE t.rn = 1`,
                [...batch, date],
            )) as Array<{ fanpageId: number | string; d: string } & Record<MetricKey, number | string | null>>;
            const n = (v: number | string | null) => (v == null ? null : Number(v));
            for (const r of rows) {
                out.set(Number(r.fanpageId), { date: r.d, followers: n(r.followers), reach: n(r.reach), engagement: n(r.engagement), views: n(r.views) });
            }
        }
        return out;
    }

    /** Followers của lần nhập gần nhất TRƯỚC `date` (để cảnh báo giảm >50%). */
    private async previousFollowers(fanpageId: number, date: string): Promise<number | null> {
        const rows = (await this.repo.query(
            'SELECT followers FROM fanpage_metric_snapshots WHERE fanpage_id = ? AND followers IS NOT NULL AND snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1',
            [fanpageId, date],
        )) as Array<{ followers: number | string }>;
        return rows.length ? Number(rows[0].followers) : null;
    }

    private auditShape(r: FanpageMetricSnapshot) {
        return {
            id: r.id,
            fanpageId: r.fanpageId,
            snapshotDate: r.snapshotDate,
            followers: r.followers,
            reach: r.reach,
            engagement: r.engagement,
            views: r.views,
            note: r.note,
        };
    }

    private async getView(id: number): Promise<SnapshotView> {
        return (await this.repo
            .createQueryBuilder('s')
            .leftJoin('s.createdBy', 'createdBy')
            .addSelect(['createdBy.id', 'createdBy.name'])
            .leftJoin('s.updatedBy', 'updatedBy')
            .addSelect(['updatedBy.id', 'updatedBy.name'])
            .where('s.id = :id', { id })
            .getOneOrFail()) as SnapshotView;
    }

    /**
     * Lõi upsert DÙNG CHUNG cho Drawer và lưới nhập (X7). Không kiểm tra quyền (người gọi đã kiểm).
     * - Trường `undefined` = giữ nguyên giá trị cũ; `null` = xoá giá trị đó. Kiểm tra trên bản ĐÃ GỘP (phải còn ≥ 1 chỉ số).
     * - `expectedUpdatedAt` có gửi (kể cả null = "lúc đọc chưa có dòng") mà dòng đã đổi -> STALE (X24).
     * - Followers giảm >50% so với lần nhập trước mà chưa `confirmDrop` -> SUSPICIOUS_DROP (cảnh báo, FE có nút "Vẫn lưu").
     */
    private async saveRow(
        fanpageId: number,
        date: string,
        input: MetricValuesDto & { expectedUpdatedAt?: string | null; confirmDrop?: boolean },
        user: FanpageCaller,
        retried = false,
    ): Promise<SaveResult> {
        const existing = await this.repo.findOne({ where: { fanpageId, snapshotDate: date } });

        if (input.expectedUpdatedAt !== undefined) {
            const expectedMs = input.expectedUpdatedAt === null ? null : new Date(input.expectedUpdatedAt).getTime();
            if (expectedMs !== null && Number.isNaN(expectedMs)) return { ok: false, code: 'INVALID', message: 'expectedUpdatedAt không hợp lệ' };
            const currentMs = existing ? existing.updatedAt.getTime() : null;
            if (expectedMs !== currentMs) {
                return { ok: false, code: 'STALE', message: 'Số liệu này vừa được người khác sửa — tải lại rồi lưu lại', currentUpdatedAt: existing?.updatedAt ?? null };
            }
        }

        const merged: MetricInput = {};
        for (const k of METRIC_KEYS) merged[k] = input[k] !== undefined ? input[k] : (existing?.[k] ?? null);
        const error = validateSnapshot(date, merged, todayVnStr());
        if (error) return { ok: false, code: 'INVALID', message: error };
        const note = input.note !== undefined ? blankToNull(input.note) : (existing?.note ?? null);

        // Chỉ cảnh báo khi followers THỰC SỰ được gửi lên lần này (không nhắc lại khi chỉ sửa ghi chú/reach).
        if (!input.confirmDrop && input.followers != null) {
            const prev = await this.previousFollowers(fanpageId, date);
            if (isSuspiciousDrop(prev, input.followers)) {
                return { ok: false, code: 'SUSPICIOUS_DROP', message: `Followers giảm hơn 50% so với lần nhập trước (${prev}) — có gõ nhầm không?` };
            }
        }

        const before = existing ? this.auditShape(existing) : null;
        try {
            const saved = await this.repo.save(
                existing
                    ? Object.assign(existing, { ...merged, note, updatedById: user.id })
                    : this.repo.create({ fanpageId, snapshotDate: date, ...merged, note, createdById: user.id, updatedById: user.id }),
            );
            this.auditService.logActionAsync(user.id, 'UPSERT_FANPAGE_SNAPSHOT', 'fanpage_snapshot', saved.id, before, this.auditShape(saved));
            return { ok: true, id: saved.id, updatedAt: saved.updatedAt };
        } catch (err) {
            // 2 người tạo cùng (Page, ngày) cùng lúc: UNIQUE chặn người sau -> thử lại 1 lần theo nhánh cập nhật (không nhân đôi dòng).
            if (isDuplicateKey(err) && !retried) return this.saveRow(fanpageId, date, input, user, true);
            throw err;
        }
    }
}
