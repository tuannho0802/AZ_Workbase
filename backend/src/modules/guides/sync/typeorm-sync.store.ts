import { DataSource, In, Repository } from 'typeorm';
import { Guide } from '../../../database/entities/guide.entity';
import { RoleEntity } from '../../../database/entities/role.entity';
import { Position } from '../../../database/entities/position.entity';
import { Department } from '../../../database/entities/department.entity';
import { Permission } from '../../../database/entities/permission.entity';
import { GuidesService, GuideCaller } from '../guides.service';
import { CreateGuideDto } from '../dto/create-guide.dto';
import { UpdateGuideDto } from '../dto/update-guide.dto';
import { GuideSpec } from './guide-file.parser';
import { DbGuideState } from './guide-sync.planner';
import { SyncStore } from './guide-sync.executor';

interface Lookups {
  roleIdByCode: Map<string, number>;
  roleCodeById: Map<number, string>;
  positionIdByCode: Map<string, number>;
  positionCodeById: Map<number, string>;
  departmentIdByName: Map<string, number>;
  departmentNameById: Map<number, string>;
}

/**
 * `SyncStore` thật: đọc/ghi qua TypeORM và đi qua `GuidesService.create/update` (validate + transaction + audit như khi sửa trên UI).
 * Người gọi truyền `guides` đã dựng sẵn (xem scripts/guides-sync.ts) và `actor` = tài khoản được ghi vào created_by/updated_by/audit.
 */
export class TypeOrmSyncStore implements SyncStore {
  private lookups: Lookups | null = null;

  constructor(
    private readonly ds: DataSource,
    private readonly guides: GuidesService,
    private readonly actor: GuideCaller,
  ) {}

  private get guideRepo(): Repository<Guide> {
    return this.ds.getRepository(Guide);
  }

  private async getLookups(): Promise<Lookups> {
    if (this.lookups) return this.lookups;
    const [roles, positions, departments] = await Promise.all([
      this.ds.getRepository(RoleEntity).find(),
      this.ds.getRepository(Position).find(),
      this.ds.getRepository(Department).find(),
    ]);
    this.lookups = {
      roleIdByCode: new Map(roles.map((r) => [r.code, r.id])),
      roleCodeById: new Map(roles.map((r) => [r.id, r.code])),
      positionIdByCode: new Map(positions.map((p) => [p.code, p.id])),
      positionCodeById: new Map(positions.map((p) => [p.id, p.code])),
      departmentIdByName: new Map(departments.map((d) => [d.name, d.id])),
      departmentNameById: new Map(departments.map((d) => [d.id, d.name])),
    };
    return this.lookups;
  }

  async loadDbGuides(): Promise<DbGuideState[]> {
    const l = await this.getLookups();
    const rows = await this.guideRepo.find({
      relations: { guideRoles: true, guidePositions: true, guideDepartments: true, guidePermissions: true },
      order: { id: 'ASC' },
    });
    return rows.map((g) => ({
      id: g.id,
      sourceHash: g.sourceHash ?? null,
      spec: {
        title: g.title,
        slug: g.slug,
        sortOrder: g.sortOrder,
        published: g.isPublished,
        // Id không còn tra được (role bị xoá...) -> giữ dạng "#id" để khác file -> hiện ra như 1 khác biệt thật, không im lặng bỏ qua.
        roles: (g.guideRoles ?? []).map((r) => l.roleCodeById.get(r.roleId) ?? `#${r.roleId}`),
        positions: (g.guidePositions ?? []).map((p) => l.positionCodeById.get(p.positionId) ?? `#${p.positionId}`),
        departments: (g.guideDepartments ?? []).map((d) => l.departmentNameById.get(d.departmentId) ?? `#${d.departmentId}`),
        permissions: (g.guidePermissions ?? []).map((p) => p.permissionKey),
        content: g.content,
      },
    }));
  }

  private idsOf(spec: GuideSpec) {
    const l = this.lookups;
    if (!l) throw new Error('assertRefsExist phải được gọi trước');
    return {
      roleIds: spec.roles.map((c) => l.roleIdByCode.get(c) as number),
      positionIds: spec.positions.map((c) => l.positionIdByCode.get(c) as number),
      departmentIds: spec.departments.map((n) => l.departmentIdByName.get(n) as number),
    };
  }

  async assertRefsExist(spec: GuideSpec): Promise<void> {
    const l = await this.getLookups();
    const missing: string[] = [];
    for (const c of spec.roles) if (!l.roleIdByCode.has(c)) missing.push(`role "${c}"`);
    for (const c of spec.positions) if (!l.positionIdByCode.has(c)) missing.push(`vị trí (code) "${c}"`);
    for (const n of spec.departments) if (!l.departmentIdByName.has(n)) missing.push(`phòng ban (tên) "${n}"`);
    if (spec.permissions.length) {
      const found = await this.ds.getRepository(Permission).find({ where: { key: In(spec.permissions) }, select: { key: true } });
      const known = new Set(found.map((p) => p.key));
      for (const k of spec.permissions) if (!known.has(k)) missing.push(`permission "${k}"`);
    }
    if (missing.length) throw new Error(`không tồn tại trong DB: ${missing.join('; ')}`);
  }

  async create(spec: GuideSpec): Promise<{ id: number }> {
    const dto = {
      title: spec.title,
      slug: spec.slug,
      content: spec.content,
      sortOrder: spec.sortOrder,
      isPublished: spec.published,
      requiredPermissions: spec.permissions,
      ...this.idsOf(spec),
    } as CreateGuideDto;
    const created = await this.guides.create(dto, this.actor);
    return { id: created.id };
  }

  async update(id: number, spec: GuideSpec): Promise<void> {
    // Luôn gửi đủ mọi chiều (kể cả []) để bỏ giới hạn đã xoá khỏi file.
    const dto = {
      title: spec.title,
      content: spec.content,
      sortOrder: spec.sortOrder,
      isPublished: spec.published,
      requiredPermissions: spec.permissions,
      ...this.idsOf(spec),
    } as UpdateGuideDto;
    await this.guides.update(id, dto, this.actor);
  }

  async setSourceHash(id: number, hash: string): Promise<void> {
    // update() trực tiếp không đổi updated_by/audit: đây chỉ là dấu vết kỹ thuật của lần sync.
    await this.guideRepo.update({ id }, { sourceHash: hash });
  }
}
