import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpageCaller, FanpageScopes } from './fanpage-access.service';

/** Bộ lọc chạy được ở tầng SQL. Lọc `cadence` cần số liệu bài nên làm SAU khi tính insights (xem FanpagesService). */
export interface FanpageSqlFilters {
    platformId?: number;
    ownerId?: number;
    isActive?: 'true' | 'false';
    search?: string;
    healthStatusId?: number;
    /** false (mặc định) = ẩn Page đã lưu trữ · true = chỉ đã lưu trữ · all = cả hai. */
    archived?: 'false' | 'true' | 'all';
    orphan?: 'true';
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

/** Scope hợp lệ của `fanpages.view`; không có quyền xem -> 403. Dùng chung list/overview/today/stats/export (X3). */
export function requireViewScope(scopes: FanpageScopes): 'own' | 'department' | 'all' {
    const v = scopes.view;
    if (v !== 'own' && v !== 'department' && v !== 'all') throw new ForbiddenException('Bạn không có quyền xem Fanpage');
    return v;
}

type WhereQb = Pick<SelectQueryBuilder<Fanpage>, 'andWhere'>;

/**
 * MỘT nguồn áp scope duy nhất cho mọi truy vấn Page (cùng quy tắc với `FanpageAccessHelper.allows`).
 * Nhiều người phụ trách: lọc bằng subquery trên bảng nối (KHÔNG lọc theo alias `owners` đã join để danh sách người phụ trách
 * trả về vẫn đủ, không bị cắt chỉ còn người khớp điều kiện). Alias gốc phải là `f`.
 */
export function applyFanpageScope(qb: WhereQb, user: Pick<FanpageCaller, 'id'>, scopes: FanpageScopes): void {
    const view = requireViewScope(scopes);
    if (view === 'own') {
        qb.andWhere('f.id IN (SELECT fo.fanpage_id FROM fanpage_owners fo WHERE fo.user_id = :uid)', { uid: user.id });
    } else if (view === 'department') {
        qb.andWhere(
            new Brackets((b) => {
                b.where('f.id IN (SELECT fo.fanpage_id FROM fanpage_owners fo WHERE fo.user_id = :uid)', { uid: user.id });
                if (scopes.managed.length) {
                    b.orWhere(
                        'f.id IN (SELECT fo2.fanpage_id FROM fanpage_owners fo2 INNER JOIN users ou ON ou.id = fo2.user_id WHERE ou.department_id IN (:...managed))',
                        { managed: scopes.managed },
                    );
                }
            }),
        );
    }
}

/**
 * Áp bộ lọc SQL. `BooleanTransformer` KHÔNG chạy trong QueryBuilder.where -> truyền thẳng 1/0 (SKILL_NESTJS_BACKEND mục 10).
 * `archived` mặc định `false` (ẩn Page đã lưu trữ).
 */
export function applyFanpageFilters(qb: WhereQb, q: FanpageSqlFilters): void {
    if (q.platformId != null) qb.andWhere('f.platformId = :platformId', { platformId: q.platformId });
    if (q.ownerId != null) {
        qb.andWhere('f.id IN (SELECT fo3.fanpage_id FROM fanpage_owners fo3 WHERE fo3.user_id = :ownerId)', { ownerId: q.ownerId });
    }
    if (q.isActive) qb.andWhere('f.isActive = :act', { act: q.isActive === 'true' ? 1 : 0 });
    if (q.healthStatusId != null) qb.andWhere('f.healthStatusId = :healthStatusId', { healthStatusId: q.healthStatusId });
    if (q.search?.trim()) qb.andWhere('(f.name LIKE :s OR f.url LIKE :s)', { s: `%${escapeLike(q.search.trim())}%` });

    const archived = q.archived ?? 'false';
    if (archived === 'false') qb.andWhere('f.archivedAt IS NULL');
    else if (archived === 'true') qb.andWhere('f.archivedAt IS NOT NULL');

    if (q.orphan === 'true') {
        qb.andWhere(
            'NOT EXISTS (SELECT 1 FROM fanpage_owners fo4 INNER JOIN users ou4 ON ou4.id = fo4.user_id WHERE fo4.fanpage_id = f.id AND ou4.is_active = 1)',
        );
    }
}

/** Dựng + chạy truy vấn Page đã áp scope/bộ lọc. List, overview, today, stats, export đều đi qua đây (PLAN 6.2). */
@Injectable()
export class FanpageScopedQuery {
    constructor(
        @InjectRepository(Fanpage)
        private readonly repo: Repository<Fanpage>,
    ) { }

    /** Page đầy đủ (nền tảng, tình trạng, người phụ trách) đã áp scope + lọc, sắp xếp ổn định. */
    async load(user: FanpageCaller, scopes: FanpageScopes, filters: FanpageSqlFilters = {}): Promise<Fanpage[]> {
        const qb = this.repo
            .createQueryBuilder('f')
            .leftJoinAndSelect('f.platform', 'platform')
            .leftJoin('f.healthStatus', 'health')
            .addSelect(['health.id', 'health.name', 'health.color', 'health.isBlocking'])
            .leftJoin('f.owner', 'owner')
            .addSelect(['owner.id', 'owner.name', 'owner.employeeCode', 'owner.departmentId'])
            .leftJoin('f.owners', 'owners')
            .addSelect(['owners.id', 'owners.name', 'owners.employeeCode', 'owners.departmentId', 'owners.isActive']);

        applyFanpageScope(qb, user, scopes);
        applyFanpageFilters(qb, filters);

        qb.orderBy('f.isActive', 'DESC').addOrderBy('f.updatedAt', 'DESC').addOrderBy('f.id', 'DESC').addOrderBy('owners.name', 'ASC');
        return qb.getMany();
    }

    /**
     * Page "đang theo dõi" TOÀN HỆ THỐNG (không áp scope người dùng) cho cron nhắc việc: đang bật theo dõi, chưa lưu trữ, tình trạng
     * KHÔNG chặn. Khớp ĐÚNG `isTrackedPage` (helper thuần) - nếu đổi định nghĩa "theo dõi" phải đổi cả 2 nơi.
     * `BooleanTransformer` không chạy trong QueryBuilder -> truyền thẳng 1/0.
     */
    async loadTrackable(): Promise<Fanpage[]> {
        return this.repo
            .createQueryBuilder('f')
            .leftJoinAndSelect('f.platform', 'platform')
            .leftJoin('f.healthStatus', 'health')
            .addSelect(['health.id', 'health.name', 'health.color', 'health.isBlocking'])
            .leftJoin('f.owners', 'owners')
            .addSelect(['owners.id', 'owners.name', 'owners.isActive'])
            .where('f.archivedAt IS NULL')
            .andWhere('f.isActive = :act', { act: 1 })
            .andWhere('(health.id IS NULL OR health.isBlocking = :blk)', { blk: 0 })
            .orderBy('f.id', 'ASC')
            .getMany();
    }

    /** Đếm Page đã lưu trữ trong phạm vi (badge tab "Đã lưu trữ") - không JOIN. */
    async countArchived(user: FanpageCaller, scopes: FanpageScopes): Promise<number> {
        const qb = this.repo.createQueryBuilder('f');
        applyFanpageScope(qb, user, scopes);
        qb.andWhere('f.archivedAt IS NOT NULL');
        return qb.getCount();
    }
}