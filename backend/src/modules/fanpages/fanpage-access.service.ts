import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionsService } from '../permissions/permissions.service';
import { DepartmentManagerHelper } from '../departments/helpers/department-manager.helper';
import { FanpageAccessHelper, FanpageAccessContext } from './helpers/fanpage-access.helper';

export interface FanpageCaller {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

/** Quyền của người gọi trên TỪNG Page - FE dùng để ẩn nút trước khi user bấm (tránh lộ UI rồi báo 403). */
export interface FanpageFlags {
  canEdit: boolean;
  canDelete: boolean;
  canManagePosts: boolean;
  canDeletePosts: boolean;
  canManageNotes: boolean;
  canDeleteNotes: boolean;
}

export const FANPAGE_FLAG_KEYS: Array<[keyof FanpageFlags, string]> = [
  ['canEdit', 'fanpages.edit'],
  ['canDelete', 'fanpages.delete'],
  ['canManagePosts', 'fanpage_posts.manage'],
  ['canDeletePosts', 'fanpage_posts.delete'],
  ['canManageNotes', 'fanpage_notes.manage'],
  ['canDeleteNotes', 'fanpage_notes.delete'],
];

export interface FanpageScopes {
  view: string | null;
  flagScopes: Record<keyof FanpageFlags, string | null>;
  managed: number[];
}

/**
 * Tra scope + dựng context quan hệ người gọi ↔ Page, dùng chung cho Fanpages/Posts/Notes service
 * (mirror phần "Scope / context" của UtmsService). Root Admin (role=admin VÀ isRootAdmin) luôn 'all' -
 * lối thoát hiểm cứng, không phụ thuộc DB (cùng PermissionGuard/RolesService).
 */
@Injectable()
export class FanpageAccessService {
  constructor(
    @InjectRepository(Fanpage)
    private readonly fanpageRepo: Repository<Fanpage>,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Scope hiệu lực của 1 permission. Thiếu quyền / scope NULL -> null (fail-closed). */
  async scopeOf(user: FanpageCaller, key: string): Promise<string | null> {
    if (user.role === Role.ADMIN && user.isRootAdmin) return 'all';
    const { allowed, scope } = await this.permissionsService.hasPermission(
      user.role,
      key,
      user.departmentId,
      user.positionId,
    );
    if (!allowed) return null;
    return scope ?? null;
  }

  /** Permission nhị phân (không scope): scopeOf() trả null cho loại này nên phải đọc `allowed`. */
  async hasBinary(user: FanpageCaller, key: string): Promise<boolean> {
    if (user.role === Role.ADMIN && user.isRootAdmin) return true;
    const { allowed } = await this.permissionsService.hasPermission(user.role, key, user.departmentId, user.positionId);
    return allowed;
  }

  async managedDepartmentIds(userId: number): Promise<number[]> {
    return DepartmentManagerHelper.getManagedDepartmentIds(this.fanpageRepo.manager.getRepository(DepartmentManager), userId);
  }

  /** Tra scope của `fanpages.view` + 6 permission hành động 1 LẦN cho cả request (không tra lại theo từng Page). */
  async resolveScopes(user: FanpageCaller): Promise<FanpageScopes> {
    const [view, ...rest] = await Promise.all([
      this.scopeOf(user, 'fanpages.view'),
      ...FANPAGE_FLAG_KEYS.map(([, key]) => this.scopeOf(user, key)),
    ]);
    const flagScopes = {} as Record<keyof FanpageFlags, string | null>;
    FANPAGE_FLAG_KEYS.forEach(([name], i) => {
      flagScopes[name] = rest[i];
    });
    const managed = [view, ...rest].includes('department') ? await this.managedDepartmentIds(user.id) : [];
    return { view, flagScopes, managed };
  }

  buildContext(page: Fanpage, userId: number, managedDepartmentIds: number[]): FanpageAccessContext {
    // `owners` là nguồn sự thật; Page nạp thiếu `owners` (hiếm) thì lùi về người phụ trách chính để fail-closed đúng.
    const owners = page.owners ?? (page.owner ? [page.owner] : []);
    const ownerIds = owners.map((o) => o.id);
    if (!page.owners && page.ownerId != null && !ownerIds.includes(page.ownerId)) ownerIds.push(page.ownerId);
    return {
      userId,
      ownerIds,
      ownerDepartmentIds: owners.map((o) => o.departmentId).filter((d): d is number => d != null),
      managedDepartmentIds,
    };
  }

  flagsFor(page: Fanpage, userId: number, s: FanpageScopes): FanpageFlags {
    const ctx = this.buildContext(page, userId, s.managed);
    const out = {} as FanpageFlags;
    for (const [name] of FANPAGE_FLAG_KEYS) out[name] = FanpageAccessHelper.allows(s.flagScopes[name], ctx);
    return out;
  }

  /** Nạp Page kèm nền tảng + người phụ trách/người tạo (CHỈ cột cần thiết, không kéo password...). */
  async loadPage(id: number): Promise<Fanpage> {
    const page = await this.fanpageRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.platform', 'platform')
      .leftJoin('f.owner', 'owner')
      .addSelect(['owner.id', 'owner.name', 'owner.employeeCode', 'owner.departmentId'])
      .leftJoin('f.owners', 'owners')
      .addSelect(['owners.id', 'owners.name', 'owners.employeeCode', 'owners.departmentId'])
      .leftJoin('f.createdBy', 'createdBy')
      .addSelect(['createdBy.id', 'createdBy.name'])
      .where('f.id = :id', { id })
      .orderBy('owners.name', 'ASC')
      .getOne();
    if (!page) throw new NotFoundException('Không tìm thấy Page này');
    return page;
  }

  /** Nạp Page rồi bắt buộc `key` (scope) phải phủ tới Page đó, không thì 403. Trả Page đã nạp. */
  async assertPageAccess(user: FanpageCaller, key: string, pageId: number, deniedMessage: string): Promise<Fanpage> {
    const page = await this.loadPage(pageId);
    const scope = await this.scopeOf(user, key);
    const managed = scope === 'department' ? await this.managedDepartmentIds(user.id) : [];
    if (!FanpageAccessHelper.allows(scope, this.buildContext(page, user.id, managed))) {
      throw new ForbiddenException(deniedMessage);
    }
    return page;
  }
}