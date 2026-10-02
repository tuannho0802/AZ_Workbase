import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Guide } from '../../database/entities/guide.entity';
import { GuideRole } from '../../database/entities/guide-role.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { GuideAccessHelper } from './helpers/guide-access.helper';
import { CreateGuideDto, GUIDE_SLUG_MAX } from './dto/create-guide.dto';
import { UpdateGuideDto } from './dto/update-guide.dto';

export const GUIDES_MANAGE_PERMISSION = 'guides.manage';

/** Slug dành riêng: trùng tên nhóm route tĩnh `/guides/manage/*`. */
const RESERVED_SLUGS = new Set(['manage']);
const SLUG_COLUMN_MAX = 150;
const SLUG_SUFFIX_TRIES = 50;

/** Phần của `request.user` mà module cần (xem JwtStrategy.validate). */
export interface GuideCaller {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

export interface GuideRoleBrief {
  id: number;
  code: string;
  name: string;
  color: string;
}

/** Mục trong mục lục (người dùng thường) - KHÔNG kèm nội dung. */
export interface GuideListItem {
  id: number;
  title: string;
  slug: string;
  sortOrder: number;
  updatedAt: Date;
}

/** Mục trong danh sách quản trị - KHÔNG kèm nội dung, có role + trạng thái. */
export interface GuideManageItem extends GuideListItem {
  isPublished: boolean;
  roleIds: number[];
  roles: GuideRoleBrief[];
  createdAt: Date;
}

export interface GuideDetail extends GuideManageItem {
  content: string;
}

@Injectable()
export class GuidesService {
  private readonly logger = new Logger(GuidesService.name);

  constructor(
    @InjectRepository(Guide)
    private readonly guideRepo: Repository<Guide>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Quyền
  // ---------------------------------------------------------------------------

  /**
   * Người gọi có `guides.manage` không. Root Admin (role=admin VÀ isRootAdmin) luôn có - lối thoát hiểm
   * cứng cùng PermissionGuard/UtmsService.hasBinary(), không phụ thuộc DB.
   */
  async canManage(user: GuideCaller): Promise<boolean> {
    if (user.role === Role.ADMIN && user.isRootAdmin) return true;
    const { allowed } = await this.permissionsService.hasPermission(
      user.role,
      GUIDES_MANAGE_PERMISSION,
      user.departmentId,
      user.positionId,
    );
    return allowed;
  }

  private async callerRoleId(user: GuideCaller): Promise<number | null> {
    const role = await this.roleRepo.findOne({ where: { code: user.role }, select: { id: true } });
    return role?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Đọc (mọi role đăng nhập)
  // ---------------------------------------------------------------------------

  /** Mục lục: guide đã xuất bản + đúng role của người gọi (người có guides.manage thấy tất cả bản đã xuất bản). */
  async listVisible(user: GuideCaller): Promise<GuideListItem[]> {
    const [canManage, roleId] = await Promise.all([this.canManage(user), this.callerRoleId(user)]);
    const guides = await this.guideRepo.find({
      where: { isPublished: true },
      select: { id: true, title: true, slug: true, sortOrder: true, isPublished: true, updatedAt: true },
      relations: { guideRoles: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return guides
      .filter((g) =>
        GuideAccessHelper.canView(
          { isPublished: g.isPublished, assignedRoleIds: (g.guideRoles ?? []).map((r) => r.roleId) },
          roleId,
          canManage,
        ),
      )
      .map((g) => ({ id: g.id, title: g.title, slug: g.slug, sortOrder: g.sortOrder, updatedAt: g.updatedAt }));
  }

  /** Nội dung 1 guide theo slug. Không được xem (nháp / sai role / không tồn tại) -> 404 (không lộ sự tồn tại). */
  async getBySlug(slug: string, user: GuideCaller): Promise<GuideDetail> {
    const guide = await this.guideRepo.findOne({ where: { slug }, relations: { guideRoles: true } });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');

    const [canManage, roleId] = await Promise.all([this.canManage(user), this.callerRoleId(user)]);
    const roleIds = (guide.guideRoles ?? []).map((r) => r.roleId);
    if (!GuideAccessHelper.canView({ isPublished: guide.isPublished, assignedRoleIds: roleIds }, roleId, canManage)) {
      throw new NotFoundException('Không tìm thấy hướng dẫn');
    }
    return this.toDetail(guide, await this.loadRoles(roleIds));
  }

  // ---------------------------------------------------------------------------
  // Quản trị (@RequirePermission guides.manage ở controller)
  // ---------------------------------------------------------------------------

  /** Danh sách quản trị: gồm cả bản nháp, kèm role + trạng thái, KHÔNG kèm nội dung. */
  async listManage(): Promise<GuideManageItem[]> {
    const guides = await this.guideRepo.find({
      select: {
        id: true,
        title: true,
        slug: true,
        sortOrder: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
      relations: { guideRoles: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const allRoleIds = [...new Set(guides.flatMap((g) => (g.guideRoles ?? []).map((r) => r.roleId)))];
    const roles = await this.loadRoles(allRoleIds);
    return guides.map((g) => {
      const roleIds = (g.guideRoles ?? []).map((r) => r.roleId);
      return this.toManageItem(g, roleIds, roles.filter((r) => roleIds.includes(r.id)));
    });
  }

  /** 1 guide theo id (kể cả bản nháp) - dùng cho trình soạn. */
  async getManageDetail(id: number): Promise<GuideDetail> {
    const guide = await this.guideRepo.findOne({ where: { id }, relations: { guideRoles: true } });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');
    const roleIds = (guide.guideRoles ?? []).map((r) => r.roleId);
    return this.toDetail(guide, await this.loadRoles(roleIds));
  }

  async create(dto: CreateGuideDto, user: GuideCaller): Promise<GuideDetail> {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Tiêu đề không được để trống');
    if (!dto.content.trim()) throw new BadRequestException('Nội dung không được để trống');

    const roleIds = await this.validateRoleIds(dto.roleIds);
    const slug = await this.resolveNewSlug(dto.slug, title);

    let savedId: number;
    try {
      savedId = await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(
          Guide,
          manager.create(Guide, {
            title,
            slug,
            content: dto.content,
            sortOrder: dto.sortOrder ?? 0,
            isPublished: dto.isPublished ?? false,
            createdBy: user.id,
            updatedBy: null,
          }),
        );
        if (roleIds.length) {
          await manager.insert(
            GuideRole,
            roleIds.map((roleId) => ({ guideId: saved.id, roleId })),
          );
        }
        return saved.id;
      });
    } catch (err) {
      this.rethrowSlugConflict(err);
    }

    const detail = await this.getManageDetail(savedId);
    this.auditService.logActionAsync(user.id, 'CREATE_GUIDE', 'guide', savedId, null, this.auditSnapshot(detail));
    return detail;
  }

  async update(id: number, dto: UpdateGuideDto, user: GuideCaller): Promise<GuideDetail> {
    const guide = await this.guideRepo.findOne({ where: { id }, relations: { guideRoles: true } });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');

    const before = this.toDetail(guide, []);
    before.roleIds = (guide.guideRoles ?? []).map((r) => r.roleId);

    const patch: Partial<Guide> = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Tiêu đề không được để trống');
      patch.title = title;
    }
    if (dto.content !== undefined) {
      if (!dto.content.trim()) throw new BadRequestException('Nội dung không được để trống');
      patch.content = dto.content;
    }
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;
    if (dto.isPublished !== undefined) patch.isPublished = dto.isPublished;
    if (dto.slug !== undefined && dto.slug !== guide.slug) {
      await this.assertSlugAvailable(dto.slug, guide.id);
      patch.slug = dto.slug;
    }

    const newRoleIds = dto.roleIds !== undefined ? await this.validateRoleIds(dto.roleIds) : null;

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(Guide, { id }, { ...patch, updatedBy: user.id });
        if (newRoleIds !== null) {
          await manager.delete(GuideRole, { guideId: id });
          if (newRoleIds.length) {
            await manager.insert(
              GuideRole,
              newRoleIds.map((roleId) => ({ guideId: id, roleId })),
            );
          }
        }
      });
    } catch (err) {
      this.rethrowSlugConflict(err);
    }

    const after = await this.getManageDetail(id);
    this.auditService.logActionAsync(
      user.id,
      'UPDATE_GUIDE',
      'guide',
      id,
      this.auditSnapshot(before),
      { ...this.auditSnapshot(after), contentChanged: dto.content !== undefined && dto.content !== guide.content },
    );
    return after;
  }

  /**
   * Xoá mềm. Lưu NGUYÊN VĂN guide (kể cả nội dung + role) vào audit TRƯỚC khi xoá để truy vết/khôi phục.
   * Đổi slug sang `deleted-<id>-<slug>` để slug cũ dùng lại được (UNIQUE index tính cả bản ghi đã xoá mềm).
   */
  async remove(id: number, user: GuideCaller): Promise<{ success: true }> {
    const guide = await this.guideRepo.findOne({ where: { id }, relations: { guideRoles: true } });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');

    const roleIds = (guide.guideRoles ?? []).map((r) => r.roleId);
    const snapshot = {
      id: guide.id,
      title: guide.title,
      slug: guide.slug,
      content: guide.content,
      sortOrder: guide.sortOrder,
      isPublished: guide.isPublished,
      roleIds,
    };

    const freedSlug = `deleted-${guide.id}-${guide.slug}`.slice(0, SLUG_COLUMN_MAX);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Guide, { id }, { slug: freedSlug, updatedBy: user.id });
      await manager.softDelete(Guide, { id });
    });

    this.auditService.logActionAsync(user.id, 'DELETE_GUIDE', 'guide', id, snapshot, null);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Nội bộ
  // ---------------------------------------------------------------------------

  /** Role phải tồn tại; loại trùng. Mảng rỗng/undefined = không giới hạn role. */
  private async validateRoleIds(roleIds?: number[]): Promise<number[]> {
    const ids = [...new Set(roleIds ?? [])];
    if (ids.length === 0) return [];
    const found = await this.roleRepo.find({ where: { id: In(ids) }, select: { id: true } });
    if (found.length !== ids.length) {
      throw new BadRequestException('Có role không tồn tại');
    }
    return ids;
  }

  private async loadRoles(roleIds: number[]): Promise<GuideRoleBrief[]> {
    if (roleIds.length === 0) return [];
    const roles = await this.roleRepo.find({ where: { id: In(roleIds) } });
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name, color: r.color }));
  }

  private async isSlugTaken(slug: string, exceptId?: number): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug)) return true;
    // withDeleted: UNIQUE index cũng tính bản ghi đã xoá mềm.
    const found = await this.guideRepo.findOne({ where: { slug }, withDeleted: true, select: { id: true } });
    return !!found && found.id !== exceptId;
  }

  private async assertSlugAvailable(slug: string, exceptId?: number): Promise<void> {
    if (await this.isSlugTaken(slug, exceptId)) {
      throw new ConflictException(`Slug "${slug}" đã được dùng, hãy chọn slug khác`);
    }
  }

  /** Slug được gửi lên -> phải rảnh (409 nếu trùng); không gửi -> sinh từ tiêu đề, trùng thì thêm -2, -3... */
  private async resolveNewSlug(explicit: string | undefined, title: string): Promise<string> {
    if (explicit) {
      await this.assertSlugAvailable(explicit);
      return explicit;
    }
    const base = GuideAccessHelper.slugify(title, GUIDE_SLUG_MAX - 4);
    if (!(await this.isSlugTaken(base))) return base;
    for (let n = 2; n < SLUG_SUFFIX_TRIES + 2; n++) {
      const candidate = `${base}-${n}`;
      if (!(await this.isSlugTaken(candidate))) return candidate;
    }
    throw new ConflictException('Không tạo được slug duy nhất từ tiêu đề, hãy nhập slug thủ công');
  }

  /** Hai request tạo/sửa cùng lúc cùng slug: DB chặn bằng UNIQUE -> đổi thành 409 thay vì 500. */
  private rethrowSlugConflict(err: unknown): never {
    const e = err as { code?: string; errno?: number };
    if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
      throw new ConflictException('Slug đã được dùng, hãy chọn slug khác');
    }
    this.logger.error('Ghi hướng dẫn thất bại', (err as Error)?.stack);
    throw err;
  }

  private toManageItem(g: Guide, roleIds: number[], roles: GuideRoleBrief[]): GuideManageItem {
    return {
      id: g.id,
      title: g.title,
      slug: g.slug,
      sortOrder: g.sortOrder,
      isPublished: g.isPublished,
      roleIds,
      roles,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  private toDetail(g: Guide, roles: GuideRoleBrief[]): GuideDetail {
    const roleIds = (g.guideRoles ?? []).map((r) => r.roleId);
    return { ...this.toManageItem(g, roleIds, roles), content: g.content };
  }

  /** Bản ghi audit gọn: không nhét nguyên nội dung (chỉ độ dài) cho create/update; delete lưu nguyên văn riêng. */
  private auditSnapshot(d: GuideDetail) {
    return {
      title: d.title,
      slug: d.slug,
      sortOrder: d.sortOrder,
      isPublished: d.isPublished,
      roleIds: d.roleIds,
      contentLength: d.content?.length ?? 0,
    };
  }
}
