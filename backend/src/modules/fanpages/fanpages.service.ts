import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpagePlatform } from '../../database/entities/fanpage-platform.entity';
import { FanpageHealthStatus } from '../../database/entities/fanpage-health-status.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { CreateFanpageDto, UpdateFanpageDto, FanpageQueryDto } from './dto/fanpage.dto';
import { FanpageAccessHelper } from './helpers/fanpage-access.helper';
import { FanpageAccessService, FanpageCaller, FanpageFlags, FanpageScopes } from './fanpage-access.service';
import { FanpageScopedQuery, requireViewScope } from './fanpage-scoped-query';
import { FanpageInsightsService, PageInsights } from './fanpage-insights.service';
import { FanpageMetricsService } from './fanpage-metrics.service';
import { LatestMetric } from './helpers/fanpage-metrics.helper';

export interface OwnerOption {
    id: number;
    name: string;
    employeeCode: string;
    departmentId: number | null;
}

/** Chuẩn hoá link để chống trùng "có/không dấu / cuối": cắt khoảng trắng + bỏ dấu / ở cuối. */
export const normalizeFanpageUrl = (raw: string): string => raw.trim().replace(/\/+$/, '');

const blankToNull = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim());

/** Trường Page trả về FE: cột gốc (trừ quan hệ `healthStatus`, đổi tên thành `health`) + cờ quyền + nhịp đăng/đếm bài. */
export type FanpageView = Omit<Fanpage, 'healthStatus'> &
    PageInsights & {
        flags: FanpageFlags;
        health: { id: number; name: string; color: string; isBlocking: boolean } | null;
        /** Follower nhập tay mới nhất + chênh lệch so với lần nhập trước (null = chưa có số liệu nào). */
        latestMetrics: LatestMetric | null;
    };

const isDuplicateKey = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && ((err as { code?: string }).code === 'ER_DUP_ENTRY' || (err as { errno?: number }).errno === 1062);

const snapshot = (p: Fanpage) => ({
    id: p.id,
    platformId: p.platformId,
    name: p.name,
    url: p.url,
    ownerId: p.ownerId,
    ownerIds: (p.owners ?? []).map((o) => o.id),
    isActive: p.isActive,
    healthStatusId: p.healthStatusId ?? null,
    healthNote: p.healthNote ?? null,
    targetPostsPerWeek: p.targetPostsPerWeek ?? null,
    isArchived: p.archivedAt != null,
});

@Injectable()
export class FanpagesService {
    constructor(
        @InjectRepository(Fanpage)
        private readonly repo: Repository<Fanpage>,
        @InjectRepository(FanpagePlatform)
        private readonly platformRepo: Repository<FanpagePlatform>,
        @InjectRepository(FanpageHealthStatus)
        private readonly healthRepo: Repository<FanpageHealthStatus>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly access: FanpageAccessService,
        private readonly auditService: AuditService,
        private readonly scoped: FanpageScopedQuery,
        private readonly insights: FanpageInsightsService,
        private readonly metrics: FanpageMetricsService,
    ) { }

    // ───────────── Danh sách / chi tiết ─────────────

    async list(user: FanpageCaller, q: FanpageQueryDto) {
        const scopes = await this.access.resolveScopes(user);
        requireViewScope(scopes);

        // 1 nguồn scope + lọc SQL dùng chung với overview/today/stats/export (FanpageScopedQuery - PLAN 6.2, X3).
        // `cadence` cần số liệu bài nên lọc SAU khi tính insights (cùng nguồn `cadence.state` với thẻ KPI - X2).
        const { cadence, ...sqlFilters } = q;
        const pages = await this.scoped.load(user, scopes, sqlFilters);
        const [insights, latest] = await Promise.all([this.insights.forPages(pages), this.metrics.latestFollowers(pages.map((p) => p.id))]);

        let rows = pages.map((p) => this.present(p, user, scopes, insights.get(p.id) as PageInsights, latest.get(p.id) ?? null));
        if (cadence) rows = rows.filter((r) => r.cadence.state === cadence);

        return {
            data: rows,
            capabilities: {
                canCreate: await this.access.hasBinary(user, 'fanpages.create'),
                canAssignOwner: FanpageAccessHelper.canAssignOwner(scopes.flagScopes.canEdit),
            },
        };
    }

    async findOne(id: number, user: FanpageCaller) {
        const page = await this.access.assertPageAccess(user, 'fanpages.view', id, 'Bạn không có quyền xem Page này');
        return this.presentOne(page, user, await this.access.resolveScopes(user));
    }

    /** Gắn cờ quyền + nhịp đăng theo Page. Không lộ trường nhạy cảm của User (đã giới hạn cột ở loadPage/list). */
    private present(page: Fanpage, user: FanpageCaller, scopes: FanpageScopes, insights: PageInsights, latestMetrics: LatestMetric | null): FanpageView {
        const { healthStatus, ...rest } = page;
        const health = healthStatus
            ? { id: healthStatus.id, name: healthStatus.name, color: healthStatus.color, isBlocking: healthStatus.isBlocking }
            : null;
        return { ...rest, ...insights, health, latestMetrics, flags: this.access.flagsFor(page, user.id, scopes) };
    }

    /** Như `present` nhưng tự tính insights cho 1 Page (tạo/sửa/chi tiết/lưu trữ). */
    private async presentOne(page: Fanpage, user: FanpageCaller, scopes: FanpageScopes): Promise<FanpageView> {
        const [insightMap, latest] = await Promise.all([this.insights.forPages([page]), this.metrics.latestFollowers([page.id])]);
        return this.present(page, user, scopes, insightMap.get(page.id) as PageInsights, latest.get(page.id) ?? null);
    }

    // ───────────── Tạo / sửa / xoá ─────────────

    async create(dto: CreateFanpageDto, user: FanpageCaller) {
        await this.assertPlatformUsable(dto.platformId);
        const ownerIds = await this.resolveOwnersForCreate(dto.ownerIds, user);
        const url = normalizeFanpageUrl(dto.url);
        await this.assertUrlFree(url);
        // Tình trạng: chọn rõ thì phải dùng được; bỏ trống = dòng mặc định (nếu đã seed).
        let healthStatusId: number | null;
        if (dto.healthStatusId != null) {
            await this.assertHealthUsable(dto.healthStatusId);
            healthStatusId = dto.healthStatusId;
        } else {
            healthStatusId = (await this.healthRepo.findOne({ where: { isDefault: true }, select: ['id'], order: { id: 'ASC' } }))?.id ?? null;
        }

        let saved: Fanpage;
        try {
            saved = await this.repo.save(
                this.repo.create({
                    platformId: dto.platformId,
                    name: dto.name.trim(),
                    url,
                    ownerId: ownerIds[0],
                    owners: ownerIds.map((id) => ({ id }) as User),
                    isActive: true,
                    healthStatusId,
                    healthNote: blankToNull(dto.healthNote),
                    targetPostsPerWeek: dto.targetPostsPerWeek ?? null,
                    createdById: user.id,
                }),
            );
        } catch (err) {
            if (isDuplicateKey(err)) throw new ConflictException('Link Page này đã tồn tại trong hệ thống');
            throw err;
        }
        const fresh = await this.access.loadPage(saved.id);
        this.auditService.logActionAsync(user.id, 'CREATE_FANPAGE', 'fanpage', saved.id, null, snapshot(fresh));

        // Trả kèm cờ quyền, KHÔNG đòi người tạo có fanpages.view (đã có fanpages.create là đủ để nhận kết quả).
        return this.presentOne(fresh, user, await this.access.resolveScopes(user));
    }

    async update(id: number, dto: UpdateFanpageDto, user: FanpageCaller) {
        const page = await this.access.loadPage(id);
        const scopes = await this.access.resolveScopes(user);
        const editScope = scopes.flagScopes.canEdit;
        if (!FanpageAccessHelper.allows(editScope, this.access.buildContext(page, user.id, scopes.managed))) {
            throw new ForbiddenException('Bạn không có quyền sửa Page này');
        }
        // Page đã lưu trữ là bản ghi đóng: phải bỏ lưu trữ trước khi sửa (tránh sửa nhầm trên Page ẩn khỏi danh sách).
        if (page.archivedAt != null) throw new ConflictException('Page này đã được lưu trữ - hãy bỏ lưu trữ trước khi chỉnh sửa');

        const before = snapshot(page);
        const patch: Partial<
            Pick<Fanpage, 'platformId' | 'name' | 'url' | 'ownerId' | 'isActive' | 'healthStatusId' | 'healthNote' | 'healthChangedAt' | 'targetPostsPerWeek'>
        > = {};

        if (dto.name !== undefined && dto.name.trim() !== page.name) patch.name = dto.name.trim();
        if (dto.isActive !== undefined && dto.isActive !== page.isActive) patch.isActive = dto.isActive;

        if (dto.healthStatusId !== undefined && dto.healthStatusId !== page.healthStatusId) {
            await this.assertHealthUsable(dto.healthStatusId);
            patch.healthStatusId = dto.healthStatusId;
            patch.healthChangedAt = new Date();
        }
        if (dto.healthNote !== undefined) {
            const note = blankToNull(dto.healthNote);
            if (note !== (page.healthNote ?? null)) patch.healthNote = note;
        }
        if (dto.targetPostsPerWeek !== undefined && dto.targetPostsPerWeek !== (page.targetPostsPerWeek ?? null)) {
            patch.targetPostsPerWeek = dto.targetPostsPerWeek;
        }

        if (dto.platformId !== undefined && dto.platformId !== page.platformId) {
            await this.assertPlatformUsable(dto.platformId);
            patch.platformId = dto.platformId;
        }

        if (dto.url !== undefined) {
            const url = normalizeFanpageUrl(dto.url);
            if (url !== page.url) {
                await this.assertUrlFree(url, page.id);
                patch.url = url;
            }
        }

        // Đổi danh sách người phụ trách (nhiều người): so theo TẬP ID, thứ tự chỉ quyết định người chính.
        let ownerChange: { added: number[]; removed: number[] } | null = null;
        if (dto.ownerIds !== undefined) {
            const current = (page.owners ?? []).map((o) => o.id);
            const next = dto.ownerIds;
            const added = next.filter((id) => !current.includes(id));
            const removed = current.filter((id) => !next.includes(id));
            const primaryChanged = next[0] !== page.ownerId;
            if (added.length || removed.length || primaryChanged) {
                if (!FanpageAccessHelper.canAssignOwner(editScope)) {
                    throw new ForbiddenException('Bạn không có quyền đổi người phụ trách Page');
                }
                for (const id of added) await this.assertAssignable(id, editScope, user);
                // Gỡ người thuộc phòng ban ngoài phạm vi quản lý cũng bị chặn (tránh scope department "gỡ sạch" người khác để chiếm Page).
                const managed = editScope === 'department' ? await this.access.managedDepartmentIds(user.id) : [];
                for (const o of page.owners ?? []) {
                    if (removed.includes(o.id) && !FanpageAccessHelper.canAssignTo(editScope, o.departmentId ?? null, managed)) {
                        throw new ForbiddenException('Bạn không được gỡ người phụ trách ngoài phòng ban mình quản lý');
                    }
                }
                patch.ownerId = next[0];
                ownerChange = { added, removed };
            }
        }

        if (Object.keys(patch).length === 0) return this.presentOne(page, user, scopes);

        // repo.update (không save) để KHÔNG dính bẫy "relation đã nạp đè lên cột ID" của TypeORM
        // (SKILL_NESTJS_BACKEND mục 13) - `platform`/`owner` đang được nạp sẵn trong `page`.
        try {
            await this.repo.manager.transaction(async (tx) => {
                const fanpageRepo = tx.getRepository(Fanpage);
                // patch luôn có ownerId khi đổi người phụ trách -> @UpdateDateColumn tự bump updated_at.
                await fanpageRepo.update(id, patch);
                if (ownerChange && (ownerChange.added.length || ownerChange.removed.length)) {
                    await fanpageRepo.createQueryBuilder().relation(Fanpage, 'owners').of(id).addAndRemove(ownerChange.added, ownerChange.removed);
                }
            });
        } catch (err) {
            if (isDuplicateKey(err)) throw new ConflictException('Link Page này đã tồn tại trong hệ thống');
            throw err;
        }
        const fresh = await this.access.loadPage(id);
        this.auditService.logActionAsync(user.id, 'UPDATE_FANPAGE', 'fanpage', id, before, snapshot(fresh));
        return this.presentOne(fresh, user, scopes);
    }

    // ───────────── Lưu trữ / bỏ lưu trữ ─────────────

    /**
     * Lưu trữ = đóng hẳn Page: ẩn khỏi danh sách mặc định, NGẦM đặt `is_active = false`, giữ nguyên toàn bộ lịch sử.
     * Quyền = `fanpages.edit` phủ tới Page (không tạo key riêng - PLAN mục 7). Ghi audit để timeline đọc được.
     */
    async archive(id: number, user: FanpageCaller) {
        const page = await this.access.assertPageAccess(user, 'fanpages.edit', id, 'Bạn không có quyền lưu trữ Page này');
        if (page.archivedAt != null) throw new ConflictException('Page này đã được lưu trữ');
        const before = snapshot(page);
        await this.repo.update(id, { archivedAt: new Date(), isActive: false });
        const fresh = await this.access.loadPage(id);
        this.auditService.logActionAsync(user.id, 'ARCHIVE_FANPAGE', 'fanpage', id, before, snapshot(fresh));
        return this.presentOne(fresh, user, await this.access.resolveScopes(user));
    }

    /** Bỏ lưu trữ: Page quay lại danh sách và được theo dõi lại (`is_active = true`); người dùng có thể tắt theo dõi sau. */
    async unarchive(id: number, user: FanpageCaller) {
        const page = await this.access.assertPageAccess(user, 'fanpages.edit', id, 'Bạn không có quyền bỏ lưu trữ Page này');
        if (page.archivedAt == null) throw new ConflictException('Page này chưa được lưu trữ');
        const before = snapshot(page);
        await this.repo.update(id, { archivedAt: null, isActive: true });
        const fresh = await this.access.loadPage(id);
        this.auditService.logActionAsync(user.id, 'UNARCHIVE_FANPAGE', 'fanpage', id, before, snapshot(fresh));
        return this.presentOne(fresh, user, await this.access.resolveScopes(user));
    }

    async remove(id: number, user: FanpageCaller): Promise<{ deleted: true }> {
        const page = await this.access.assertPageAccess(user, 'fanpages.delete', id, 'Bạn không có quyền xoá Page này');
        const [postCount, noteCount] = await Promise.all([
            this.repo.manager.count('FanpagePost', { where: { fanpageId: id } }),
            this.repo.manager.count('FanpageNote', { where: { fanpageId: id } }),
        ]);
        // Chụp snapshot TRƯỚC khi xoá (audit cần dữ liệu cũ). Bài đăng + ghi chú xoá theo qua FK ON DELETE CASCADE.
        const snap = { ...snapshot(page), postCount, noteCount };
        await this.repo.delete(id);
        this.auditService.logActionAsync(user.id, 'DELETE_FANPAGE', 'fanpage', id, snap, null);
        return { deleted: true };
    }

    // ───────────── Người phụ trách ─────────────

    /** Danh sách nhân viên có thể GIAO Page (theo scope fanpages.edit); scope hẹp -> chỉ chính mình. */
    async ownerOptions(user: FanpageCaller): Promise<OwnerOption[]> {
        const editScope = await this.access.scopeOf(user, 'fanpages.edit');
        const select = ['id', 'name', 'employeeCode', 'departmentId'] as Array<keyof User>;
        let users: User[];
        if (editScope === 'all') {
            users = await this.userRepo.find({ where: { isActive: true }, select, order: { name: 'ASC' } });
        } else if (editScope === 'department') {
            const managed = await this.access.managedDepartmentIds(user.id);
            users = await this.userRepo.find({
                where: [...(managed.length ? [{ isActive: true, departmentId: In(managed) }] : []), { id: user.id }],
                select,
                order: { name: 'ASC' },
            });
        } else {
            users = await this.userRepo.find({ where: { id: user.id }, select });
        }
        return users.map((u) => ({
            id: u.id,
            name: u.name,
            employeeCode: u.employeeCode,
            departmentId: u.departmentId ?? null,
        }));
    }

    /** Mặc định [người tạo]. Giao cho người khác (hoặc nhiều người) cần scope rộng của fanpages.edit + từng người phải trong phạm vi giao. */
    private async resolveOwnersForCreate(targetIds: number[] | undefined, user: FanpageCaller): Promise<number[]> {
        if (!targetIds?.length) return [user.id];
        const others = targetIds.filter((id) => id !== user.id);
        if (others.length === 0) return targetIds;
        const editScope = await this.access.scopeOf(user, 'fanpages.edit');
        if (!FanpageAccessHelper.canAssignOwner(editScope)) {
            throw new ForbiddenException('Bạn chỉ được tạo Page do chính mình phụ trách');
        }
        for (const id of others) await this.assertAssignable(id, editScope, user);
        return targetIds;
    }

    private async assertAssignable(targetId: number, editScope: string | null, user: FanpageCaller): Promise<void> {
        const target = await this.userRepo.findOne({ where: { id: targetId, isActive: true }, select: ['id', 'departmentId'] });
        if (!target) throw new BadRequestException(`Nhân viên ID ${targetId} không tồn tại hoặc đã bị khóa`);
        const managed = editScope === 'department' ? await this.access.managedDepartmentIds(user.id) : [];
        if (!FanpageAccessHelper.canAssignTo(editScope, target.departmentId ?? null, managed)) {
            throw new ForbiddenException('Bạn không được giao Page cho nhân viên ngoài phòng ban mình quản lý');
        }
    }

    // ───────────── Validate ─────────────

    private async assertPlatformUsable(platformId: number): Promise<void> {
        const platform = await this.platformRepo.findOne({ where: { id: platformId } });
        if (!platform) throw new BadRequestException('Nền tảng không tồn tại');
        if (!platform.isActive) throw new BadRequestException(`Nền tảng "${platform.name}" đã bị khoá, hãy chọn nền tảng khác`);
    }

    /** Tình trạng phải tồn tại và chưa khoá (đổi sang chính tình trạng đang dùng thì không đi qua đây). */
    private async assertHealthUsable(healthStatusId: number): Promise<void> {
        const status = await this.healthRepo.findOne({ where: { id: healthStatusId } });
        if (!status) throw new BadRequestException('Tình trạng Page không tồn tại');
        if (status.isLocked) throw new BadRequestException(`Tình trạng "${status.name}" đã bị khoá, hãy chọn tình trạng khác`);
    }

    private async assertUrlFree(url: string, exceptId?: number): Promise<void> {
        const existing = await this.repo.findOne({ where: { url }, select: ['id'] });
        if (existing && existing.id !== exceptId) {
            throw new ConflictException('Link Page này đã tồn tại trong hệ thống');
        }
    }
}