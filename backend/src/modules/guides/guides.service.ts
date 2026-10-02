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
import { GuidePosition } from '../../database/entities/guide-position.entity';
import { GuideDepartment } from '../../database/entities/guide-department.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Position } from '../../database/entities/position.entity';
import { Department } from '../../database/entities/department.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { GuideAccessHelper, GuideViewer } from './helpers/guide-access.helper';
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

export interface GuidePositionBrief {
  id: number;
  code: string;
  name: string;
  color: string;
}

export interface GuideDepartmentBrief {
  id: number;
  name: string;
  color: string;
}

/** Các chiều "ai được xem" đã nạp sẵn nhãn + màu. */
interface GuideAudience {
  roles: GuideRoleBrief[];
  positions: GuidePositionBrief[];
  departments: GuideDepartmentBrief[];
}

const EMPTY_AUDIENCE: GuideAudience = { roles: [], positions: [], departments: [] };

/** Quan hệ cần nạp để biết guide dành cho ai. */
const AUDIENCE_RELATIONS = { guideRoles: true, guidePositions: true, guideDepartments: true } as const;

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
  positionIds: number[];
  positions: GuidePositionBrief[];
  departmentIds: number[];
  departments: GuideDepartmentBrief[];
  createdAt: Date;
}

export interface GuideDetail extends GuideManageItem {
  content: string;
  /** Tên người sửa cuối (null = chưa sửa lần nào hoặc user đã bị xoá hẳn). */
  updatedByName: string | null;
}

@Injectable()
export class GuidesService {
  private readonly logger = new Logger(GuidesService.name);

  constructor(
    @InjectRepository(Guide)
    private readonly guideRepo: Repository<Guide>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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

  /** Role + vị trí + phòng ban hiện tại của người gọi (vị trí/phòng ban lấy live từ DB qua JwtStrategy). */
  private async viewerOf(user: GuideCaller): Promise<GuideViewer> {
    const role = await this.roleRepo.findOne({ where: { code: user.role }, select: { id: true } });
    return { roleId: role?.id ?? null, positionId: user.positionId ?? null, departmentId: user.departmentId ?? null };
  }

  private visibilityOf(g: Guide) {
    return {
      isPublished: g.isPublished,
      assignedRoleIds: (g.guideRoles ?? []).map((r) => r.roleId),
      assignedPositionIds: (g.guidePositions ?? []).map((r) => r.positionId),
      assignedDepartmentIds: (g.guideDepartments ?? []).map((r) => r.departmentId),
    };
  }

  // ---------------------------------------------------------------------------
  // Đọc (mọi role đăng nhập)
  // ---------------------------------------------------------------------------

  /** Mục lục: guide đã xuất bản + đúng role của người gọi (người có guides.manage thấy tất cả bản đã xuất bản). */
  async listVisible(user: GuideCaller): Promise<GuideListItem[]> {
    const [canManage, viewer] = await Promise.all([this.canManage(user), this.viewerOf(user)]);
    const guides = await this.guideRepo.find({
      where: { isPublished: true },
      select: { id: true, title: true, slug: true, sortOrder: true, isPublished: true, updatedAt: true },
      relations: AUDIENCE_RELATIONS,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return guides
      .filter((g) => GuideAccessHelper.canView(this.visibilityOf(g), viewer, canManage))
      .map((g) => ({ id: g.id, title: g.title, slug: g.slug, sortOrder: g.sortOrder, updatedAt: g.updatedAt }));
  }

  /** Nội dung 1 guide theo slug. Không được xem (nháp / sai role / không tồn tại) -> 404 (không lộ sự tồn tại). */
  async getBySlug(slug: string, user: GuideCaller): Promise<GuideDetail> {
    const guide = await this.guideRepo.findOne({ where: { slug }, relations: AUDIENCE_RELATIONS });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');

    const [canManage, viewer] = await Promise.all([this.canManage(user), this.viewerOf(user)]);
    if (!GuideAccessHelper.canView(this.visibilityOf(guide), viewer, canManage)) {
      throw new NotFoundException('Không tìm thấy hướng dẫn');
    }
    return this.toDetail(guide, await this.loadAudience([guide]), await this.updaterNameOf(guide));
  }

  // ---------------------------------------------------------------------------
  // Quản trị (@RequirePermission guides.manage ở controller)
  // ---------------------------------------------------------------------------

  /** Mọi role (hệ thống + tuỳ chỉnh) để chọn "role được xem" ở trình soạn. */
  async listRoleOptions(): Promise<GuideRoleBrief[]> {
    const roles = await this.roleRepo.find({ order: { id: 'ASC' } });
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name, color: r.color }));
  }

  /** Mọi vị trí (kèm màu) để chọn "vị trí được xem" ở trình soạn. */
  async listPositionOptions(): Promise<GuidePositionBrief[]> {
    const positions = await this.positionRepo.find({ order: { name: 'ASC' } });
    return positions.map((p) => ({ id: p.id, code: p.code, name: p.name, color: p.color }));
  }

  /** Mọi phòng ban (kèm màu) để chọn "phòng ban được xem" ở trình soạn. */
  async listDepartmentOptions(): Promise<GuideDepartmentBrief[]> {
    const departments = await this.departmentRepo.find({ order: { name: 'ASC' } });
    return departments.map((d) => ({ id: d.id, name: d.name, color: d.color }));
  }

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
      relations: AUDIENCE_RELATIONS,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const audience = await this.loadAudience(guides);
    return guides.map((g) => this.toManageItem(g, audience));
  }

  /** 1 guide theo id (kể cả bản nháp) - dùng cho trình soạn. */
  async getManageDetail(id: number): Promise<GuideDetail> {
    const guide = await this.guideRepo.findOne({ where: { id }, relations: AUDIENCE_RELATIONS });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');
    return this.toDetail(guide, await this.loadAudience([guide]), await this.updaterNameOf(guide));
  }

  async create(dto: CreateGuideDto, user: GuideCaller): Promise<GuideDetail> {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Tiêu đề không được để trống');
    if (!dto.content.trim()) throw new BadRequestException('Nội dung không được để trống');

    const roleIds = await this.validateIds(this.roleRepo, dto.roleIds, 'role');
    const positionIds = await this.validateIds(this.positionRepo, dto.positionIds, 'vị trí');
    const departmentIds = await this.validateIds(this.departmentRepo, dto.departmentIds, 'phòng ban');
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
        await this.insertLinks(manager, saved.id, { roleIds, positionIds, departmentIds });
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
    const guide = await this.guideRepo.findOne({ where: { id }, relations: AUDIENCE_RELATIONS });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');

    const before = this.toDetail(guide, EMPTY_AUDIENCE, null);

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

    // Không gửi = giữ nguyên chiều đó; gửi [] = bỏ giới hạn chiều đó.
    const newRoleIds = dto.roleIds !== undefined ? await this.validateIds(this.roleRepo, dto.roleIds, 'role') : null;
    const newPositionIds =
      dto.positionIds !== undefined ? await this.validateIds(this.positionRepo, dto.positionIds, 'vị trí') : null;
    const newDepartmentIds =
      dto.departmentIds !== undefined ? await this.validateIds(this.departmentRepo, dto.departmentIds, 'phòng ban') : null;

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(Guide, { id }, { ...patch, updatedBy: user.id });
        if (newRoleIds !== null) await manager.delete(GuideRole, { guideId: id });
        if (newPositionIds !== null) await manager.delete(GuidePosition, { guideId: id });
        if (newDepartmentIds !== null) await manager.delete(GuideDepartment, { guideId: id });
        await this.insertLinks(manager, id, {
          roleIds: newRoleIds ?? [],
          positionIds: newPositionIds ?? [],
          departmentIds: newDepartmentIds ?? [],
        });
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
    const guide = await this.guideRepo.findOne({ where: { id }, relations: AUDIENCE_RELATIONS });
    if (!guide) throw new NotFoundException('Không tìm thấy hướng dẫn');

    const { roleIds, positionIds, departmentIds } = this.idsOf(guide);
    const snapshot = {
      id: guide.id,
      title: guide.title,
      slug: guide.slug,
      content: guide.content,
      sortOrder: guide.sortOrder,
      isPublished: guide.isPublished,
      roleIds,
      positionIds,
      departmentIds,
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

  /** ID phải tồn tại trong bảng tương ứng; loại trùng. Mảng rỗng/undefined = không giới hạn chiều đó. */
  private async validateIds(
    repo: Repository<{ id: number }>,
    ids: number[] | undefined,
    label: string,
  ): Promise<number[]> {
    const unique = [...new Set(ids ?? [])];
    if (unique.length === 0) return [];
    const found = await repo.find({ where: { id: In(unique) }, select: { id: true } });
    if (found.length !== unique.length) {
      throw new BadRequestException(`Có ${label} không tồn tại`);
    }
    return unique;
  }

  private idsOf(g: Guide) {
    return {
      roleIds: (g.guideRoles ?? []).map((r) => r.roleId),
      positionIds: (g.guidePositions ?? []).map((r) => r.positionId),
      departmentIds: (g.guideDepartments ?? []).map((r) => r.departmentId),
    };
  }

  private async insertLinks(
    manager: { insert: (target: any, rows: any[]) => Promise<unknown> },
    guideId: number,
    ids: { roleIds: number[]; positionIds: number[]; departmentIds: number[] },
  ): Promise<void> {
    if (ids.roleIds.length) await manager.insert(GuideRole, ids.roleIds.map((roleId) => ({ guideId, roleId })));
    if (ids.positionIds.length) {
      await manager.insert(GuidePosition, ids.positionIds.map((positionId) => ({ guideId, positionId })));
    }
    if (ids.departmentIds.length) {
      await manager.insert(GuideDepartment, ids.departmentIds.map((departmentId) => ({ guideId, departmentId })));
    }
  }

  /** Nạp nhãn + màu của mọi role/vị trí/phòng ban được tham chiếu bởi các guide (3 truy vấn, không N+1). */
  private async loadAudience(guides: Guide[]): Promise<GuideAudience> {
    const all = guides.map((g) => this.idsOf(g));
    const uniq = (pick: (x: (typeof all)[number]) => number[]) => [...new Set(all.flatMap(pick))];
    const [roles, positions, departments] = await Promise.all([
      this.loadRoles(uniq((x) => x.roleIds)),
      this.loadPositions(uniq((x) => x.positionIds)),
      this.loadDepartments(uniq((x) => x.departmentIds)),
    ]);
    return { roles, positions, departments };
  }

  private async loadRoles(roleIds: number[]): Promise<GuideRoleBrief[]> {
    if (roleIds.length === 0) return [];
    const roles = await this.roleRepo.find({ where: { id: In(roleIds) } });
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name, color: r.color }));
  }

  private async loadPositions(ids: number[]): Promise<GuidePositionBrief[]> {
    if (ids.length === 0) return [];
    const rows = await this.positionRepo.find({ where: { id: In(ids) } });
    return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, color: p.color }));
  }

  private async loadDepartments(ids: number[]): Promise<GuideDepartmentBrief[]> {
    if (ids.length === 0) return [];
    const rows = await this.departmentRepo.find({ where: { id: In(ids) } });
    return rows.map((d) => ({ id: d.id, name: d.name, color: d.color }));
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

  /** `audience` là kho nhãn chung; ở đây chỉ lấy phần guide này tham chiếu. */
  private toManageItem(g: Guide, audience: GuideAudience): GuideManageItem {
    const { roleIds, positionIds, departmentIds } = this.idsOf(g);
    return {
      id: g.id,
      title: g.title,
      slug: g.slug,
      sortOrder: g.sortOrder,
      isPublished: g.isPublished,
      roleIds,
      roles: audience.roles.filter((r) => roleIds.includes(r.id)),
      positionIds,
      positions: audience.positions.filter((p) => positionIds.includes(p.id)),
      departmentIds,
      departments: audience.departments.filter((d) => departmentIds.includes(d.id)),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  private toDetail(g: Guide, audience: GuideAudience, updatedByName: string | null): GuideDetail {
    return { ...this.toManageItem(g, audience), content: g.content, updatedByName };
  }

  /** Tên người sửa cuối (`updated_by`). withDeleted: user đã vào thùng rác vẫn hiện tên. */
  private async updaterNameOf(g: Guide): Promise<string | null> {
    if (!g.updatedBy) return null;
    const u = await this.userRepo.findOne({
      where: { id: g.updatedBy },
      select: { id: true, name: true },
      withDeleted: true,
    });
    return u?.name ?? null;
  }

  /** Bản ghi audit gọn: không nhét nguyên nội dung (chỉ độ dài) cho create/update; delete lưu nguyên văn riêng. */
  private auditSnapshot(d: GuideDetail) {
    return {
      title: d.title,
      slug: d.slug,
      sortOrder: d.sortOrder,
      isPublished: d.isPublished,
      roleIds: d.roleIds,
      positionIds: d.positionIds,
      departmentIds: d.departmentIds,
      contentLength: d.content?.length ?? 0,
    };
  }
}
