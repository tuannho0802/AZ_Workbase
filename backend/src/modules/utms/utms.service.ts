import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Utm } from '../../database/entities/utm.entity';
import { UtmSecondaryManager } from '../../database/entities/utm-secondary-manager.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { Role } from '../../common/enums/role.enum';
import { normalizeSearchableText } from '../../common/utils/text-normalize.util';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { DepartmentManagerHelper } from '../departments/helpers/department-manager.helper';
import { UtmAccessHelper, UtmRelation, UtmRelationContext } from './helpers/utm-access.helper';
import { CreateUtmDto } from './dto/create-utm.dto';
import { UpdateUtmDto } from './dto/update-utm.dto';
import { UtmQueryDto } from './dto/utm-query.dto';
import { MergeUtmDto } from './dto/merge-utm.dto';

/** Phần của `request.user` mà module UTM cần (xem JwtStrategy.validate). */
export interface UtmCaller {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

/** Scope hiệu lực (own/department/all) của từng permission scoped; null = không có quyền. */
export interface UtmScopes {
  view: string | null;
  edit: string | null;
  assign: string | null;
  delete: string | null;
}

export interface UtmCapabilities {
  canEditIdentity: boolean;
  canEditMeta: boolean;
  canAssign: boolean;
  canDelete: boolean;
}

export interface UtmView {
  id: number;
  name: string;
  description: string | null;
  color: string;
  visibility: 'shared' | 'restricted';
  isActive: boolean;
  sortOrder: number;
  primaryManager: { id: number; name: string } | null;
  secondaryManagers: Array<{ id: number; name: string }>;
  myRole: 'primary' | 'secondary' | null;
  capabilities: UtmCapabilities;
  createdAt: Date;
  updatedAt: Date;
}

const CASCADE_BATCH = 5000;

@Injectable()
export class UtmsService {
  private readonly logger = new Logger(UtmsService.name);

  constructor(
    @InjectRepository(Utm)
    private readonly utmRepo: Repository<Utm>,
    @InjectRepository(UtmSecondaryManager)
    private readonly secondaryRepo: Repository<UtmSecondaryManager>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Scope / context (dùng chung với UtmManagersService)
  // ---------------------------------------------------------------------------

  /**
   * Scope hiệu lực của 1 permission cho người gọi. Root Admin (role=admin VÀ isRootAdmin) luôn 'all'
   * - lối thoát hiểm cứng, không phụ thuộc DB (cùng PermissionGuard/RolesService). Thiếu quyền hoặc
   * scope NULL ở key có scope -> null (fail-closed).
   */
  async scopeOf(user: UtmCaller, key: string): Promise<string | null> {
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
  async hasBinary(user: UtmCaller, key: string): Promise<boolean> {
    if (user.role === Role.ADMIN && user.isRootAdmin) return true;
    const { allowed } = await this.permissionsService.hasPermission(user.role, key, user.departmentId, user.positionId);
    return allowed;
  }

  async resolveScopes(user: UtmCaller): Promise<UtmScopes> {
    const [view, edit, assign, del] = await Promise.all([
      this.scopeOf(user, 'utms.view'),
      this.scopeOf(user, 'utms.edit'),
      this.scopeOf(user, 'utms.assign'),
      this.scopeOf(user, 'utms.delete'),
    ]);
    return { view, edit, assign, delete: del };
  }

  async managedDepartmentIds(userId: number): Promise<number[]> {
    return DepartmentManagerHelper.getManagedDepartmentIds(
      this.utmRepo.manager.getRepository(DepartmentManager),
      userId,
    );
  }

  buildContext(utm: Utm, userId: number, managedDepartmentIds: number[]): UtmRelationContext {
    return {
      userId,
      primaryManagerId: utm.primaryManagerId,
      secondaryManagerUserIds: (utm.secondaryManagers ?? []).map((m) => m.userId),
      primaryManagerDepartmentId: utm.primaryManager?.departmentId ?? null,
      managedDepartmentIds,
    };
  }

  /** Nạp UTM kèm chính (để biết phòng ban) + phụ. */
  async loadUtm(id: number): Promise<Utm> {
    const utm = await this.utmRepo.findOne({
      where: { id },
      relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
    });
    if (!utm) throw new NotFoundException('Không tìm thấy UTM này');
    return utm;
  }

  capabilities(utm: Utm, userId: number, scopes: UtmScopes, managedIds: number[]): UtmCapabilities {
    const ctx = this.buildContext(utm, userId, managedIds);
    const editRel = UtmAccessHelper.relation(scopes.edit, ctx);
    const assignRel = UtmAccessHelper.relation(scopes.assign, ctx);
    const deleteRel = UtmAccessHelper.relation(scopes.delete, ctx);
    return {
      canEditIdentity: UtmAccessHelper.canEditIdentity(editRel),
      canEditMeta: UtmAccessHelper.canEditMeta(editRel),
      canAssign: UtmAccessHelper.canEditSecondaryManagers(assignRel),
      canDelete: UtmAccessHelper.canDelete(deleteRel),
    };
  }

  toView(utm: Utm, userId: number, scopes: UtmScopes, managedIds: number[]): UtmView {
    const isPrimary = utm.primaryManagerId != null && utm.primaryManagerId === userId;
    const isSecondary = (utm.secondaryManagers ?? []).some((m) => m.userId === userId);
    return {
      id: utm.id,
      name: utm.name,
      description: utm.description,
      color: utm.color,
      visibility: utm.visibility,
      isActive: !!utm.isActive,
      sortOrder: utm.sortOrder,
      primaryManager: utm.primaryManager ? { id: utm.primaryManager.id, name: utm.primaryManager.name } : null,
      secondaryManagers: (utm.secondaryManagers ?? [])
        .filter((m) => m.user)
        .map((m) => ({ id: m.user.id, name: m.user.name })),
      myRole: isPrimary ? 'primary' : isSecondary ? 'secondary' : null,
      capabilities: this.capabilities(utm, userId, scopes, managedIds),
      createdAt: utm.createdAt,
      updatedAt: utm.updatedAt,
    };
  }

  private async detail(id: number, user: UtmCaller): Promise<UtmView> {
    const [utm, scopes, managed] = await Promise.all([
      this.loadUtm(id),
      this.resolveScopes(user),
      this.managedDepartmentIds(user.id),
    ]);
    return this.toView(utm, user.id, scopes, managed);
  }

  private isDupEntry(err: any): boolean {
    return err?.code === 'ER_DUP_ENTRY' || err?.driverError?.code === 'ER_DUP_ENTRY';
  }

  // ---------------------------------------------------------------------------
  // Đọc
  // ---------------------------------------------------------------------------

  /**
   * `GET /utms` - dropdown cho form khách hàng. CỐ Ý không gắn @RequirePermission ở controller
   * (Employee vẫn phải chọn được UTM mà không dính 403). Chỉ trả UTM ĐƯỢC DÙNG: `shared`, hoặc
   * `restricted` mà mình là chính/phụ, hoặc scope `utms.view` phủ tới (all / department).
   * Kèm `myRole` để FE biết mình là chính/phụ.
   */
  async findUsable(user: UtmCaller, query: UtmQueryDto) {
    const viewScope = await this.scopeOf(user, 'utms.view');
    const limit = query.limit ?? 50;

    const qb = this.utmRepo.createQueryBuilder('utm').orderBy('utm.sortOrder', 'ASC').addOrderBy('utm.name', 'ASC').take(limit);

    if (query.activeOnly) qb.andWhere('utm.isActive = :active', { active: 1 });
    if (query.q?.trim()) {
      // LIKE theo collation cột (utf8mb4_unicode_ci) -> không phân biệt hoa/thường và dấu.
      qb.andWhere('utm.name LIKE :q', { q: `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%` });
    }

    if (viewScope !== 'all') {
      const managed = viewScope === 'department' ? await this.managedDepartmentIds(user.id) : [];
      const clauses = [
        `utm.visibility = 'shared'`,
        'utm.primaryManagerId = :uid',
        'utm.id IN (SELECT sm.utm_id FROM utm_secondary_managers sm WHERE sm.user_id = :uid)',
      ];
      const params: Record<string, unknown> = { uid: user.id };
      if (viewScope === 'department' && managed.length > 0) {
        clauses.push('utm.primary_manager_id IN (SELECT u.id FROM users u WHERE u.department_id IN (:...managed))');
        params.managed = managed;
      }
      qb.andWhere(`(${clauses.join(' OR ')})`, params);
    }

    const utms = await qb.getMany();
    const memberRows = await this.secondaryRepo.find({ where: { userId: user.id }, select: ['utmId'] });
    const secondarySet = new Set(memberRows.map((r) => r.utmId));

    return utms.map((u) => ({
      id: u.id,
      name: u.name,
      description: u.description,
      color: u.color,
      visibility: u.visibility,
      isActive: !!u.isActive,
      primaryManagerId: u.primaryManagerId,
      myRole:
        u.primaryManagerId != null && u.primaryManagerId === user.id
          ? ('primary' as const)
          : secondarySet.has(u.id)
            ? ('secondary' as const)
            : null,
    }));
  }

  /** `GET /utms/managed-by-me` - UTM mình là Quản lý chính/phụ (không cần permission: dữ liệu tự lọc theo user). */
  async listManagedByMe(user: UtmCaller): Promise<UtmView[]> {
    const secondaryRows = await this.secondaryRepo.find({ where: { userId: user.id }, select: ['utmId'] });
    const secondaryIds = secondaryRows.map((r) => r.utmId);

    const qb = this.utmRepo
      .createQueryBuilder('utm')
      .leftJoinAndSelect('utm.primaryManager', 'primaryManager')
      .leftJoinAndSelect('utm.secondaryManagers', 'secondaryManagers')
      .leftJoinAndSelect('secondaryManagers.user', 'secondaryUser')
      .orderBy('utm.sortOrder', 'ASC')
      .addOrderBy('utm.id', 'ASC');
    if (secondaryIds.length > 0) {
      qb.where('(utm.primaryManagerId = :uid OR utm.id IN (:...sids))', { uid: user.id, sids: secondaryIds });
    } else {
      qb.where('utm.primaryManagerId = :uid', { uid: user.id });
    }

    const [utms, scopes, managed] = await Promise.all([
      qb.getMany(),
      this.resolveScopes(user),
      this.managedDepartmentIds(user.id),
    ]);
    return utms.map((u) => this.toView(u, user.id, scopes, managed));
  }

  /** `GET /utms/scoped` (@RequirePermission utms.view) - tab "Tất cả UTM", lọc theo scope của utms.view. */
  async listScoped(user: UtmCaller): Promise<UtmView[]> {
    const scopes = await this.resolveScopes(user);
    if (!scopes.view) return [];
    const managed = await this.managedDepartmentIds(user.id);

    const utms = await this.utmRepo.find({
      relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    // Lọc bằng CHÍNH helper (1 nguồn sự thật) - số UTM ở mức vài trăm nên lọc trong bộ nhớ là đủ.
    const visible = utms.filter(
      (u) => UtmAccessHelper.relation(scopes.view, this.buildContext(u, user.id, managed)) !== null,
    );
    return visible.map((u) => this.toView(u, user.id, scopes, managed));
  }

  async getOne(id: number, user: UtmCaller): Promise<UtmView> {
    return this.detail(id, user);
  }

  // ---------------------------------------------------------------------------
  // Ghi
  // ---------------------------------------------------------------------------

  /** Chuẩn hoá tên: NBSP/zero-width -> dấu cách, gộp khoảng trắng, trim. Rỗng -> 400. */
  private normalizeName(raw: string): string {
    const name = normalizeSearchableText(raw);
    if (!name) throw new BadRequestException('Tên UTM không được để trống');
    return name;
  }

  private async assertNameFree(name: string, exceptId?: number): Promise<void> {
    // So sánh theo collation cột => không phân biệt hoa/thường và dấu (cùng UNIQUE ở DB).
    const existing = await this.utmRepo.findOne({ where: { name }, relations: ['primaryManager'] });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(this.conflictMessage(existing));
    }
  }

  private conflictMessage(existing: Utm): string {
    const owner = existing.primaryManager?.name;
    return owner
      ? `UTM "${existing.name}" đã tồn tại — nhờ ${owner} (Quản lý chính) thêm bạn làm Quản lý phụ`
      : `UTM "${existing.name}" đã tồn tại`;
  }

  /**
   * Resolve UTM cho khách hàng (PLAN 7.3 + mục 5). Trả `null` = không đổi gì (cả `utmId` và `campaign` đều undefined).
   *  - `utmId === null`            -> xoá cả utm_id lẫn snapshot campaign.
   *  - `utmId` là số               -> chuẩn; BỎ QUA `campaign` gửi kèm (case 11).
   *  - chỉ có `campaign` (tương thích D7) -> tìm theo tên (CI+AI); chưa có thì tạo nếu có `utms.create`, không thì 400.
   * Chỉ validate (tồn tại / khoá / được dùng) khi UTM THAY ĐỔI so với `currentUtmId` (case 8, 9).
   */
  async resolveForCustomer(
    input: { utmId?: number | null; campaign?: string | null },
    user: UtmCaller,
    currentUtmId?: number | null,
  ): Promise<{ utmId: number | null; campaign: string | null } | null> {
    if (input.utmId === null) return { utmId: null, campaign: null };

    if (typeof input.utmId === 'number') {
      const utm = await this.utmRepo.findOne({ where: { id: input.utmId } });
      if (!utm) throw new BadRequestException('UTM không tồn tại');
      if (utm.id !== currentUtmId) await this.assertUsableForCustomer(utm, user);
      return { utmId: utm.id, campaign: utm.name };
    }

    if (input.campaign === undefined) return null;

    const name = normalizeSearchableText(input.campaign);
    if (!name) return { utmId: null, campaign: null };

    let utm = await this.utmRepo.findOne({ where: { name } });
    if (!utm) {
      const canCreate = await this.hasBinary(user, 'utms.create');
      if (!canCreate) {
        throw new BadRequestException(`UTM "${name}" chưa tồn tại và bạn không có quyền tạo UTM mới`);
      }
      try {
        const created = await this.create({ name } as CreateUtmDto, user);
        return { utmId: created.id, campaign: created.name };
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        utm = await this.utmRepo.findOne({ where: { name } }); // race: người khác vừa tạo
        if (!utm) throw err;
      }
    }
    if (utm.id !== currentUtmId) await this.assertUsableForCustomer(utm, user);
    return { utmId: utm.id, campaign: utm.name };
  }

  /** 400 nếu UTM đang khoá; 403 nếu UTM restricted mà người gọi không được dùng. */
  private async assertUsableForCustomer(utm: Utm, user: UtmCaller): Promise<void> {
    if (!utm.isActive) throw new BadRequestException(`UTM "${utm.name}" đã bị khoá, không thể chọn mới`);
    if (utm.visibility === 'shared') return;
    const full = await this.loadUtm(utm.id);
    const viewScope = await this.scopeOf(user, 'utms.view');
    const ctx = this.buildContext(full, user.id, viewScope === 'department' ? await this.managedDepartmentIds(user.id) : []);
    const isMember = ctx.primaryManagerId === user.id || ctx.secondaryManagerUserIds.includes(user.id);
    const viewRel = UtmAccessHelper.relation(viewScope, ctx);
    if (!UtmAccessHelper.canUse('restricted', isMember, viewRel)) {
      throw new ForbiddenException(`Bạn không có quyền dùng UTM "${utm.name}"`);
    }
  }

  /** `POST /utms` (@RequirePermission utms.create). Người tạo = Quản lý chính. */
  async create(dto: CreateUtmDto, user: UtmCaller): Promise<UtmView> {
    const name = this.normalizeName(dto.name);
    await this.assertNameFree(name);

    let saved: Utm;
    try {
      saved = await this.utmRepo.save(
        this.utmRepo.create({
          name,
          description: dto.description?.trim() ? dto.description.trim() : null,
          ...(dto.color ? { color: dto.color } : {}),
          visibility: dto.visibility ?? 'shared',
          isActive: true,
          primaryManagerId: user.id,
          createdById: user.id,
        }),
      );
    } catch (err) {
      if (this.isDupEntry(err)) {
        // 2 người tạo cùng tên cùng lúc: UNIQUE ở DB bắt được (PLAN mục 5, case 6).
        const existing = await this.utmRepo.findOne({ where: { name }, relations: ['primaryManager'] });
        throw new ConflictException(existing ? this.conflictMessage(existing) : `UTM "${name}" đã tồn tại`);
      }
      throw err;
    }

    this.auditService.logActionAsync(user.id, 'CREATE_UTM', 'utm', saved.id, null, {
      utmId: saved.id,
      utmName: saved.name,
      visibility: saved.visibility,
    });
    return this.detail(saved.id, user);
  }

  /**
   * `PATCH /utms/:id` (@RequirePermission utms.edit).
   *  - name / visibility: Quản lý chính hoặc scope rộng (D9). Đổi tên => cascade `customers.campaign`
   *    (snapshot) trong CÙNG transaction, KHÔNG đổi `customers.updated_at` (tránh "Sửa cuối" nhảy hàng loạt).
   *  - description / color: cả Quản lý phụ.
   */
  async update(id: number, dto: UpdateUtmDto, user: UtmCaller): Promise<UtmView> {
    const utm = await this.loadUtm(id);
    const [editScope, managed] = await Promise.all([this.scopeOf(user, 'utms.edit'), this.managedDepartmentIds(user.id)]);
    const rel = UtmAccessHelper.relation(editScope, this.buildContext(utm, user.id, managed));

    if (!UtmAccessHelper.canEditMeta(rel)) {
      throw new ForbiddenException('Bạn không có quyền sửa UTM này (không phải Quản lý chính/phụ và ngoài phạm vi quyền)');
    }

    const wantsRename = dto.name !== undefined;
    const wantsVisibility = dto.visibility !== undefined && dto.visibility !== utm.visibility;
    if ((wantsRename || wantsVisibility) && !UtmAccessHelper.canEditIdentity(rel)) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc người có quyền rộng) mới được đổi tên hoặc chế độ hiển thị UTM');
    }

    const before = { name: utm.name, description: utm.description, color: utm.color, visibility: utm.visibility };
    let renamedTo: string | null = null;

    if (wantsRename) {
      const name = this.normalizeName(dto.name as string);
      if (name !== utm.name) {
        await this.assertNameFree(name, utm.id);
        renamedTo = name;
        utm.name = name;
      }
    }
    if (dto.description !== undefined) utm.description = dto.description?.trim() ? dto.description.trim() : null;
    if (dto.color !== undefined) utm.color = dto.color;
    if (dto.visibility !== undefined) utm.visibility = dto.visibility;

    let affectedCustomers = 0;
    try {
      await this.dataSource.transaction(async (manager) => {
        // Chỉ ghi các cột của bảng utms (không save cả cây quan hệ đã nạp).
        await manager.update(Utm, utm.id, {
          name: utm.name,
          description: utm.description,
          color: utm.color,
          visibility: utm.visibility,
        });
        if (renamedTo) affectedCustomers = await this.cascadeSnapshot(manager, utm.id, renamedTo);
      });
    } catch (err) {
      if (this.isDupEntry(err)) throw new ConflictException(`UTM "${renamedTo ?? utm.name}" đã tồn tại`);
      throw err;
    }

    this.auditService.logActionAsync(
      user.id,
      'UPDATE_UTM',
      'utm',
      utm.id,
      before,
      {
        name: utm.name,
        description: utm.description,
        color: utm.color,
        visibility: utm.visibility,
        ...(renamedTo ? { affectedCustomers } : {}),
      },
    );
    return this.detail(utm.id, user);
  }

  /** Cập nhật `customers.campaign = tên mới` theo lô, giữ nguyên `updated_at`. Trả về số KH đã đổi. */
  private async cascadeSnapshot(
    manager: { query: (sql: string, params?: unknown[]) => Promise<any> },
    utmId: number,
    newName: string,
  ): Promise<number> {
    let total = 0;
    // Mỗi lượt chỉ chạm dòng còn lệch tên -> vòng lặp tự dừng khi không còn dòng nào.
    for (;;) {
      const res = await manager.query(
        `UPDATE customers SET campaign = ?, updated_at = updated_at
         WHERE utm_id = ? AND (campaign IS NULL OR BINARY campaign <> BINARY ?)
         LIMIT ${CASCADE_BATCH}`,
        [newName, utmId, newName],
      );
      const affected = Number(res?.affectedRows ?? 0);
      total += affected;
      if (affected < CASCADE_BATCH) break;
    }
    return total;
  }

  /** `PATCH /utms/:id/activate|deactivate` (@RequirePermission utms.edit) - chính, phụ hoặc scope rộng. */
  async setActive(id: number, active: boolean, user: UtmCaller): Promise<UtmView> {
    const utm = await this.loadUtm(id);
    const [editScope, managed] = await Promise.all([this.scopeOf(user, 'utms.edit'), this.managedDepartmentIds(user.id)]);
    const rel = UtmAccessHelper.relation(editScope, this.buildContext(utm, user.id, managed));
    if (!UtmAccessHelper.canEditMeta(rel)) {
      throw new ForbiddenException('Bạn không có quyền khoá/mở khoá UTM này');
    }
    if (!!utm.isActive !== active) {
      await this.utmRepo.update(utm.id, { isActive: active });
      this.auditService.logActionAsync(
        user.id,
        active ? 'ACTIVATE_UTM' : 'DEACTIVATE_UTM',
        'utm',
        utm.id,
        { isActive: !active },
        { isActive: active, utmName: utm.name },
      );
    }
    return this.detail(utm.id, user);
  }

  /**
   * `DELETE /utms/:id` (@RequirePermission utms.delete). Chỉ khi 0 KH tham chiếu - TÍNH CẢ KH đã xoá mềm
   * (raw SQL không lọc deleted_at) để không làm mất liên kết dữ liệu (D8).
   */
  async remove(id: number, user: UtmCaller): Promise<{ success: true }> {
    const utm = await this.loadUtm(id);
    const [deleteScope, managed] = await Promise.all([this.scopeOf(user, 'utms.delete'), this.managedDepartmentIds(user.id)]);
    const rel = UtmAccessHelper.relation(deleteScope, this.buildContext(utm, user.id, managed));
    if (!UtmAccessHelper.canDelete(rel)) {
      throw new ForbiddenException('Bạn không có quyền xoá UTM này');
    }

    // Đếm KHÔNG lọc scope xem của người gọi và KHÔNG lọc xoá mềm; tách active/Thùng rác để thông báo đúng
    // (nút "Khách hàng (n)" ở FE chỉ đếm KH chưa xoá trong phạm vi xem nên có thể hiện 0 khi UTM còn KH trong Thùng rác).
    const rows: Array<{ active: string | number | null; trashed: string | number | null }> = await this.utmRepo.query(
      'SELECT COALESCE(SUM(deleted_at IS NULL), 0) AS active, COALESCE(SUM(deleted_at IS NOT NULL), 0) AS trashed FROM customers WHERE utm_id = ?',
      [utm.id],
    );
    const active = Number(rows?.[0]?.active ?? 0);
    const trashed = Number(rows?.[0]?.trashed ?? 0);
    if (active + trashed > 0) {
      throw new BadRequestException(UtmsService.buildInUseMessage(utm.name, active, trashed));
    }

    await this.utmRepo.delete(utm.id); // utm_secondary_managers tự CASCADE ở DB
    this.auditService.logActionAsync(user.id, 'DELETE_UTM', 'utm', utm.id, { utmId: utm.id, utmName: utm.name }, null);
    return { success: true };
  }

  /** Thông báo không xoá được UTM: nói rõ bao nhiêu KH đang dùng và bao nhiêu nằm trong Thùng rác. */
  static buildInUseMessage(name: string, active: number, trashed: number): string {
    const parts: string[] = [];
    if (active > 0) parts.push(`${active} khách hàng đang dùng`);
    if (trashed > 0) parts.push(`${trashed} khách hàng trong Thùng rác`);
    const hint =
      trashed > 0
        ? 'Số ở nút "Khách hàng" không tính Thùng rác. Hãy xoá vĩnh viễn các khách đó trong Thùng rác, hoặc Khoá UTM này, hoặc Gộp sang UTM khác thay vì xoá'
        : 'Hãy Khoá UTM này hoặc Gộp sang UTM khác thay vì xoá';
    return `UTM "${name}" còn ${parts.join(' và ')} — ${hint}`;
  }

  /** Khoá so sánh "gần giống": bỏ dấu, hạ chữ, bỏ mọi ký tự không phải chữ/số (FB-Q4 = FB_Q4 = fbq4). */
  static similarityKey(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /** Scope rộng = `all` của utms.edit (Root Admin luôn all). Dùng cho Gộp + gợi ý trùng. */
  private async assertBroadEdit(user: UtmCaller, action: string): Promise<void> {
    if ((await this.scopeOf(user, 'utms.edit')) !== 'all') {
      throw new ForbiddenException(`Chỉ người có quyền sửa UTM phạm vi "Tất cả" mới được ${action}`);
    }
  }

  /** `GET /utms/duplicates` - nhóm UTM có tên gần giống nhau (KHÔNG tự gộp). Chỉ scope rộng. */
  async findDuplicates(user: UtmCaller) {
    await this.assertBroadEdit(user, 'xem gợi ý UTM trùng');
    const utms = await this.utmRepo.find({ order: { name: 'ASC' } });
    const groups = new Map<string, Utm[]>();
    for (const u of utms) {
      const k = UtmsService.similarityKey(u.name);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), u]);
    }
    const dup = [...groups.values()].filter((g) => g.length > 1);
    if (dup.length === 0) return [];
    const ids = dup.flat().map((u) => u.id);
    const rows: Array<{ utm_id: number; c: string | number }> = await this.utmRepo.query(
      `SELECT utm_id, COUNT(*) AS c FROM customers WHERE deleted_at IS NULL AND utm_id IN (${ids.map(() => '?').join(',')}) GROUP BY utm_id`,
      ids,
    );
    const cnt = new Map(rows.map((r) => [Number(r.utm_id), Number(r.c)]));
    return dup.map((g) => ({
      utms: g.map((u) => ({ id: u.id, name: u.name, isActive: !!u.isActive, customerCount: cnt.get(u.id) ?? 0 })),
    }));
  }

  /** `GET /utms/recent` - UTM đang hoạt động mà user đã gán gần đây nhất cho khách do mình tạo. */
  async findRecent(user: UtmCaller, limit = 5) {
    const rows: Array<{ id: number; name: string; color: string }> = await this.utmRepo.query(
      `SELECT u.id, u.name, u.color, MAX(c.created_at) AS last_used
       FROM customers c JOIN utms u ON u.id = c.utm_id
       WHERE c.created_by_id = ? AND c.deleted_at IS NULL AND u.is_active = 1
       GROUP BY u.id, u.name, u.color ORDER BY last_used DESC LIMIT ?`,
      [user.id, Math.min(Math.max(limit, 1), 20)],
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name, color: r.color }));
  }

  /**
   * `POST /utms/:id/merge {targetId}` - chuyển mọi KH (kể cả đã xoá mềm) của UTM nguồn sang UTM đích
   * (utm_id + snapshot campaign, giữ `updated_at`), rồi xoá UTM nguồn (quản lý phụ tự CASCADE).
   * Cùng 1 transaction; chỉ scope rộng.
   */
  async merge(sourceId: number, dto: MergeUtmDto, user: UtmCaller): Promise<{ success: true; movedCustomers: number; target: UtmView }> {
    await this.assertBroadEdit(user, 'gộp UTM');
    if (sourceId === dto.targetId) throw new BadRequestException('UTM nguồn và UTM đích phải khác nhau');
    const [source, target] = await Promise.all([this.loadUtm(sourceId), this.loadUtm(dto.targetId)]);
    if (!target.isActive) throw new BadRequestException(`UTM đích "${target.name}" đang bị khoá`);

    let moved = 0;
    await this.dataSource.transaction(async (manager) => {
      for (;;) {
        const res = await manager.query(
          `UPDATE customers SET utm_id = ?, campaign = ?, updated_at = updated_at WHERE utm_id = ? LIMIT ${CASCADE_BATCH}`,
          [target.id, target.name, source.id],
        );
        const affected = Number(res?.affectedRows ?? 0);
        moved += affected;
        if (affected < CASCADE_BATCH) break;
      }
      await manager.query('DELETE FROM utms WHERE id = ?', [source.id]);
    });

    this.auditService.logActionAsync(
      user.id,
      'MERGE_UTM',
      'utm',
      target.id,
      { sourceUtmId: source.id, sourceUtmName: source.name },
      { targetUtmId: target.id, targetUtmName: target.name, movedCustomers: moved },
    );
    return { success: true, movedCustomers: moved, target: await this.detail(target.id, user) };
  }
}
