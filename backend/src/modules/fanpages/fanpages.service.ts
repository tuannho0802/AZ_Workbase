import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpagePlatform } from '../../database/entities/fanpage-platform.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { CreateFanpageDto, UpdateFanpageDto, FanpageQueryDto } from './dto/fanpage.dto';
import { FanpageAccessHelper } from './helpers/fanpage-access.helper';
import { FanpageAccessService, FanpageCaller, FanpageFlags, FanpageScopes } from './fanpage-access.service';

export interface OwnerOption {
    id: number;
    name: string;
    employeeCode: string;
    departmentId: number | null;
}

/** Chuẩn hoá link để chống trùng "có/không dấu / cuối": cắt khoảng trắng + bỏ dấu / ở cuối. */
export const normalizeFanpageUrl = (raw: string): string => raw.trim().replace(/\/+$/, '');

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

const isDuplicateKey = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && ((err as { code?: string }).code === 'ER_DUP_ENTRY' || (err as { errno?: number }).errno === 1062);

const snapshot = (p: Fanpage) => ({
    id: p.id,
    platformId: p.platformId,
    name: p.name,
    url: p.url,
    ownerId: p.ownerId,
    isActive: p.isActive,
});

@Injectable()
export class FanpagesService {
    constructor(
        @InjectRepository(Fanpage)
        private readonly repo: Repository<Fanpage>,
        @InjectRepository(FanpagePlatform)
        private readonly platformRepo: Repository<FanpagePlatform>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly access: FanpageAccessService,
        private readonly auditService: AuditService,
    ) { }

    // ───────────── Danh sách / chi tiết ─────────────

    async list(user: FanpageCaller, q: FanpageQueryDto) {
        const scopes = await this.access.resolveScopes(user);
        const view = scopes.view;
        if (view !== 'own' && view !== 'department' && view !== 'all') {
            throw new ForbiddenException('Bạn không có quyền xem Fanpage');
        }

        const qb = this.repo
            .createQueryBuilder('f')
            .leftJoinAndSelect('f.platform', 'platform')
            .leftJoin('f.owner', 'owner')
            .addSelect(['owner.id', 'owner.name', 'owner.employeeCode', 'owner.departmentId'])
            .loadRelationCountAndMap('f.postCount', 'f.posts')
            .loadRelationCountAndMap('f.noteCount', 'f.notes');

        // 1 nguồn áp scope duy nhất cho danh sách (cùng quy tắc với FanpageAccessHelper.allows).
        if (view === 'own') {
            qb.andWhere('f.ownerId = :uid', { uid: user.id });
        } else if (view === 'department') {
            qb.andWhere(
                new Brackets((b) => {
                    b.where('f.ownerId = :uid', { uid: user.id });
                    if (scopes.managed.length) b.orWhere('owner.departmentId IN (:...managed)', { managed: scopes.managed });
                }),
            );
        }

        if (q.platformId != null) qb.andWhere('f.platformId = :platformId', { platformId: q.platformId });
        if (q.ownerId != null) qb.andWhere('f.ownerId = :ownerId', { ownerId: q.ownerId });
        // BooleanTransformer KHÔNG chạy trong QueryBuilder.where -> truyền thẳng 1/0 (SKILL_NESTJS_BACKEND mục 10).
        if (q.isActive) qb.andWhere('f.isActive = :act', { act: q.isActive === 'true' ? 1 : 0 });
        if (q.search?.trim()) {
            qb.andWhere('(f.name LIKE :s OR f.url LIKE :s)', { s: `%${escapeLike(q.search.trim())}%` });
        }

        qb.orderBy('f.isActive', 'DESC').addOrderBy('f.updatedAt', 'DESC').addOrderBy('f.id', 'DESC');
        const rows = await qb.getMany();

        return {
            data: rows.map((p) => this.present(p, user, scopes)),
            capabilities: {
                canCreate: await this.access.hasBinary(user, 'fanpages.create'),
                canAssignOwner: FanpageAccessHelper.canAssignOwner(scopes.flagScopes.canEdit),
            },
        };
    }

    async findOne(id: number, user: FanpageCaller) {
        const page = await this.access.assertPageAccess(user, 'fanpages.view', id, 'Bạn không có quyền xem Page này');
        return this.present(page, user, await this.access.resolveScopes(user));
    }

    /** Gắn cờ quyền theo Page. Không lộ trường nhạy cảm của User (đã giới hạn cột ở loadPage/list). */
    private present(page: Fanpage, user: FanpageCaller, scopes: FanpageScopes): Fanpage & { flags: FanpageFlags } {
        return Object.assign(page, { flags: this.access.flagsFor(page, user.id, scopes) });
    }

    // ───────────── Tạo / sửa / xoá ─────────────

    async create(dto: CreateFanpageDto, user: FanpageCaller) {
        await this.assertPlatformUsable(dto.platformId);
        const ownerId = await this.resolveOwnerForCreate(dto.ownerId, user);
        const url = normalizeFanpageUrl(dto.url);
        await this.assertUrlFree(url);

        let saved: Fanpage;
        try {
            saved = await this.repo.save(
                this.repo.create({
                    platformId: dto.platformId,
                    name: dto.name.trim(),
                    url,
                    ownerId,
                    isActive: true,
                    createdById: user.id,
                }),
            );
        } catch (err) {
            if (isDuplicateKey(err)) throw new ConflictException('Link Page này đã tồn tại trong hệ thống');
            throw err;
        }
        this.auditService.logActionAsync(user.id, 'CREATE_FANPAGE', 'fanpage', saved.id, null, snapshot(saved));

        // Trả kèm cờ quyền, KHÔNG đòi người tạo có fanpages.view (đã có fanpages.create là đủ để nhận kết quả).
        return this.present(await this.access.loadPage(saved.id), user, await this.access.resolveScopes(user));
    }

    async update(id: number, dto: UpdateFanpageDto, user: FanpageCaller) {
        const page = await this.access.loadPage(id);
        const scopes = await this.access.resolveScopes(user);
        const editScope = scopes.flagScopes.canEdit;
        if (!FanpageAccessHelper.allows(editScope, this.access.buildContext(page, user.id, scopes.managed))) {
            throw new ForbiddenException('Bạn không có quyền sửa Page này');
        }

        const before = snapshot(page);
        const patch: Partial<Pick<Fanpage, 'platformId' | 'name' | 'url' | 'ownerId' | 'isActive'>> = {};

        if (dto.name !== undefined && dto.name.trim() !== page.name) patch.name = dto.name.trim();
        if (dto.isActive !== undefined && dto.isActive !== page.isActive) patch.isActive = dto.isActive;

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

        if (dto.ownerId !== undefined && dto.ownerId !== page.ownerId) {
            if (!FanpageAccessHelper.canAssignOwner(editScope)) {
                throw new ForbiddenException('Bạn không có quyền đổi người phụ trách Page');
            }
            await this.assertAssignable(dto.ownerId, editScope, user);
            patch.ownerId = dto.ownerId;
        }

        if (Object.keys(patch).length === 0) return this.present(page, user, scopes);

        // repo.update (không save) để KHÔNG dính bẫy "relation đã nạp đè lên cột ID" của TypeORM
        // (SKILL_NESTJS_BACKEND mục 13) - `platform`/`owner` đang được nạp sẵn trong `page`.
        try {
            await this.repo.update(id, patch);
        } catch (err) {
            if (isDuplicateKey(err)) throw new ConflictException('Link Page này đã tồn tại trong hệ thống');
            throw err;
        }
        const fresh = await this.access.loadPage(id);
        this.auditService.logActionAsync(user.id, 'UPDATE_FANPAGE', 'fanpage', id, before, snapshot(fresh));
        return this.present(fresh, user, scopes);
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

    private async resolveOwnerForCreate(targetId: number | undefined, user: FanpageCaller): Promise<number> {
        if (targetId == null || targetId === user.id) return user.id;
        const editScope = await this.access.scopeOf(user, 'fanpages.edit');
        if (!FanpageAccessHelper.canAssignOwner(editScope)) {
            throw new ForbiddenException('Bạn chỉ được tạo Page do chính mình phụ trách');
        }
        await this.assertAssignable(targetId, editScope, user);
        return targetId;
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

    private async assertUrlFree(url: string, exceptId?: number): Promise<void> {
        const existing = await this.repo.findOne({ where: { url }, select: ['id'] });
        if (existing && existing.id !== exceptId) {
            throw new ConflictException('Link Page này đã tồn tại trong hệ thống');
        }
    }
}