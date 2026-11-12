import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { FanpageUtm } from '../../database/entities/fanpage-utm.entity';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { AuditService } from '../audit/audit.service';
import { UtmsService } from '../utms/utms.service';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FANPAGE_BATCH_SIZE } from './fanpage-insights.service';
import { planLinkChange, primaryColumnValue, UtmLinkRow } from './helpers/fanpage-utm.helper';

/** Tên hiển thị khi UTM hạn chế mà người xem không có quyền dùng (R7). */
export const RESTRICTED_UTM_LABEL = 'UTM hạn chế';

export interface FanpageUtmChip {
    utmId: number;
    /** Đã che thành "UTM hạn chế" khi `locked` (R7). */
    name: string;
    color: string | null;
    isActive: boolean;
    restricted: boolean;
    /** Chip khoá: UTM hạn chế mà người xem không có quyền dùng -> không gỡ/đổi chính được (X10). */
    locked: boolean;
    isPrimary: boolean;
    /** Page chính ghi công của UTM (null = chưa có). */
    primaryFanpage: { id: number; name: string } | null;
    /** Các Page KHÁC cùng gắn UTM này. */
    sharedWith: Array<{ id: number; name: string }>;
}

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

const isDuplicateKey = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && ((err as { code?: string }).code === 'ER_DUP_ENTRY' || (err as { errno?: number }).errno === 1062);

/**
 * Gắn/gỡ UTM cho Page + đổi Page chính (PLAN 3.7 R1, R9, R10; X10, X25).
 * - Gắn: `fanpages.edit` trên Page VÀ được dùng UTM (`canUse`). Page đầu tiên gắn UTM tự thành Page chính.
 * - Gỡ: cùng điều kiện, hoặc scope `fanpages.edit` = all/department. Gỡ Page chính khi UTM còn Page khác -> 409 (R10).
 * - Đổi Page chính: `fanpages.edit` phủ tới CẢ Page đang chính lẫn Page sẽ chính (R9).
 */
@Injectable()
export class FanpageUtmsService {
    constructor(
        @InjectRepository(FanpageUtm)
        private readonly linkRepo: Repository<FanpageUtm>,
        @InjectRepository(Fanpage)
        private readonly pageRepo: Repository<Fanpage>,
        private readonly access: FanpageAccessService,
        private readonly utmsService: UtmsService,
        private readonly auditService: AuditService,
        private readonly dataSource: DataSource,
    ) { }

    // ───────────── Đọc ─────────────

    /** Chip UTM của nhiều Page - 2 truy vấn gộp theo lô (không N+1, X17). Page không có UTM -> mảng rỗng. */
    async chipsForPages(pageIds: number[], user: FanpageCaller): Promise<Map<number, FanpageUtmChip[]>> {
        const out = new Map<number, FanpageUtmChip[]>(pageIds.map((id) => [id, []]));
        if (pageIds.length === 0) return out;

        const mine: FanpageUtm[] = [];
        for (const ids of chunk(pageIds, FANPAGE_BATCH_SIZE)) {
            mine.push(...(await this.linkRepo.find({ where: { fanpageId: In(ids) }, order: { id: 'ASC' } })));
        }
        if (mine.length === 0) return out;

        const utmIds = [...new Set(mine.map((l) => l.utmId))];
        const everyLink: Array<{ fanpageId: number; utmId: number; primaryUtmId: number | null; name: string }> = [];
        for (const ids of chunk(utmIds, FANPAGE_BATCH_SIZE)) {
            const rows: Array<{ fanpage_id: number; utm_id: number; primary_utm_id: number | null; name: string }> = await this.linkRepo.query(
                `SELECT fu.fanpage_id, fu.utm_id, fu.primary_utm_id, f.name FROM fanpage_utms fu INNER JOIN fanpages f ON f.id = fu.fanpage_id WHERE fu.utm_id IN (${ids
                    .map(() => '?')
                    .join(',')})`,
                ids,
            );
            for (const r of rows) {
                everyLink.push({ fanpageId: Number(r.fanpage_id), utmId: Number(r.utm_id), primaryUtmId: r.primary_utm_id == null ? null : Number(r.primary_utm_id), name: r.name });
            }
        }
        const usability = await this.utmsService.usabilityFor(user, utmIds);

        for (const link of mine) {
            const info = usability.get(link.utmId);
            if (!info) continue; // UTM vừa bị xoá giữa 2 truy vấn
            const rows = everyLink.filter((r) => r.utmId === link.utmId);
            const primary = rows.find((r) => r.primaryUtmId != null) ?? null;
            const locked = info.restricted && !info.canUse;
            out.get(link.fanpageId)?.push({
                utmId: link.utmId,
                name: locked ? RESTRICTED_UTM_LABEL : info.name,
                color: locked ? null : info.color,
                isActive: info.isActive,
                restricted: info.restricted,
                locked,
                isPrimary: link.primaryUtmId != null,
                primaryFanpage: primary ? { id: primary.fanpageId, name: primary.name } : null,
                sharedWith: rows.filter((r) => r.fanpageId !== link.fanpageId).map((r) => ({ id: r.fanpageId, name: r.name })),
            });
        }
        return out;
    }

    async chipsForPage(pageId: number, user: FanpageCaller): Promise<FanpageUtmChip[]> {
        return (await this.chipsForPages([pageId], user)).get(pageId) ?? [];
    }

    // ───────────── Ghi ─────────────

    /** `PUT /fanpages/:id/utms` - thay toàn bộ tập UTM. Trả chip mới của Page. */
    async setUtms(pageId: number, utmIds: number[], user: FanpageCaller): Promise<FanpageUtmChip[]> {
        const page = await this.access.assertPageAccess(user, 'fanpages.edit', pageId, 'Bạn không có quyền sửa Page này');
        const desired = [...new Set(utmIds.map(Number))];

        const currentRows = await this.linkRepo.find({ where: { fanpageId: pageId } });
        const currentIds = currentRows.map((l) => l.utmId);
        const touched = [...new Set([...desired, ...currentIds])];
        const usability = await this.utmsService.usabilityFor(user, touched);

        const added = desired.filter((id) => !currentIds.includes(id));
        for (const id of added) {
            const info = usability.get(id);
            if (!info) throw new BadRequestException(`UTM #${id} không tồn tại`);
            if (!info.canUse) throw new ForbiddenException(`Bạn không có quyền dùng UTM "${info.name}"`);
        }

        const removed = currentIds.filter((id) => !desired.includes(id));
        if (removed.length) {
            const editScope = await this.access.scopeOf(user, 'fanpages.edit');
            const broad = editScope === 'all' || editScope === 'department';
            for (const id of removed) {
                const info = usability.get(id);
                if (info && info.restricted && !info.canUse && !broad) {
                    throw new ForbiddenException('UTM hạn chế do người khác quản lý - bạn không gỡ được liên kết này');
                }
            }
        }

        const allLinks = await this.loadLinks(touched);
        const plan = planLinkChange(pageId, desired, allLinks);
        if (plan.blocked.length) {
            const nameOf = new Map<number, string>();
            const pageIds = [...new Set(plan.blocked.flatMap((b) => b.otherPageIds))];
            if (pageIds.length) {
                const pages = await this.pageRepo.find({ where: { id: In(pageIds) }, select: ['id', 'name'] });
                pages.forEach((p) => nameOf.set(p.id, p.name));
            }
            throw new ConflictException({
                statusCode: 409,
                message: 'Không thể gỡ Page chính khi UTM còn Page khác dùng chung - hãy đặt Page chính mới trước.',
                blocked: plan.blocked.map((b) => {
                    const info = usability.get(b.utmId);
                    const masked = info && info.restricted && !info.canUse;
                    return {
                        utmId: b.utmId,
                        utmName: masked ? RESTRICTED_UTM_LABEL : (info?.name ?? `#${b.utmId}`),
                        otherPages: b.otherPageIds.map((id) => ({ id, name: nameOf.get(id) ?? `#${id}` })),
                    };
                }),
            });
        }

        if (plan.add.length || plan.remove.length) {
            try {
                await this.dataSource.transaction(async (manager) => {
                    if (plan.remove.length) await manager.delete(FanpageUtm, { fanpageId: pageId, utmId: In(plan.remove) });
                    for (const a of plan.add) {
                        await manager.insert(FanpageUtm, {
                            fanpageId: pageId,
                            utmId: a.utmId,
                            primaryUtmId: primaryColumnValue(a.utmId, a.primary),
                            createdById: user.id,
                        });
                    }
                });
            } catch (err) {
                if (isDuplicateKey(err)) throw new ConflictException('Liên kết UTM vừa được người khác thay đổi - tải lại rồi thử lại.');
                throw err;
            }
            const label = (ids: number[]) => ids.map((id) => ({ utmId: id, name: usability.get(id)?.name ?? null }));
            if (plan.add.length) {
                this.auditService.logActionAsync(user.id, 'LINK_FANPAGE_UTM', 'fanpage', pageId, null, {
                    fanpageName: page.name,
                    utms: plan.add.map((a) => ({ utmId: a.utmId, name: usability.get(a.utmId)?.name ?? null, primary: a.primary })),
                });
            }
            if (plan.remove.length) {
                this.auditService.logActionAsync(user.id, 'UNLINK_FANPAGE_UTM', 'fanpage', pageId, { fanpageName: page.name, utms: label(plan.remove) }, null);
            }
        }
        return this.chipsForPage(pageId, user);
    }

    /** `PATCH /fanpages/:id/utms/:utmId/primary` - đặt Page này làm Page CHÍNH của UTM (R9). */
    async setPrimary(pageId: number, utmId: number, user: FanpageCaller): Promise<FanpageUtmChip[]> {
        const page = await this.access.assertPageAccess(user, 'fanpages.edit', pageId, 'Bạn không có quyền sửa Page này');
        const links = await this.loadLinks([utmId]);
        const target = links.find((l) => l.fanpageId === pageId);
        if (!target) throw new NotFoundException('UTM này chưa gắn với Page');
        if (target.isPrimary) return this.chipsForPage(pageId, user);

        const info = (await this.utmsService.usabilityFor(user, [utmId])).get(utmId);
        if (!info) throw new NotFoundException('Không tìm thấy UTM này');
        const current = links.find((l) => l.isPrimary) ?? null;

        // Chuyển số liệu giữa 2 Page => cần quyền sửa trên CẢ HAI (scope 'all' tự phủ cả hai).
        if (current) {
            await this.access.assertPageAccess(user, 'fanpages.edit', current.fanpageId, 'Bạn cần quyền sửa cả Page đang là Page chính của UTM này');
        }
        const editScope = await this.access.scopeOf(user, 'fanpages.edit');
        if (info.restricted && !info.canUse && editScope !== 'all' && editScope !== 'department') {
            throw new ForbiddenException('UTM hạn chế do người khác quản lý - bạn không đổi Page chính được');
        }

        try {
            await this.dataSource.transaction(async (manager) => {
                // Nhả khoá UNIQUE(primary_utm_id) của Page chính cũ TRƯỚC khi nâng Page mới.
                if (current) await manager.update(FanpageUtm, { fanpageId: current.fanpageId, utmId }, { primaryUtmId: null });
                await manager.update(FanpageUtm, { fanpageId: pageId, utmId }, { primaryUtmId: utmId });
            });
        } catch (err) {
            if (isDuplicateKey(err)) throw new ConflictException('Page chính vừa được người khác thay đổi - tải lại rồi thử lại.');
            throw err;
        }

        this.auditService.logActionAsync(
            user.id,
            'SET_PRIMARY_FANPAGE_UTM',
            'fanpage',
            pageId,
            { utmId, utmName: info.name, primaryFanpageId: current?.fanpageId ?? null },
            { utmId, utmName: info.name, primaryFanpageId: pageId, fanpageName: page.name },
        );
        return this.chipsForPage(pageId, user);
    }

    private async loadLinks(utmIds: number[]): Promise<UtmLinkRow[]> {
        if (utmIds.length === 0) return [];
        const rows = await this.linkRepo.find({ where: { utmId: In(utmIds) } });
        return rows.map((r) => ({ fanpageId: r.fanpageId, utmId: r.utmId, isPrimary: r.primaryUtmId != null }));
    }
}