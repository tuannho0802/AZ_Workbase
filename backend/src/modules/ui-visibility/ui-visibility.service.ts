import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { UiVisibilityRule } from '../../database/entities/ui-visibility-rule.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Department } from '../../database/entities/department.entity';
import { Position } from '../../database/entities/position.entity';
import { Role } from '../../common/enums/role.enum';
import { UpdateUiVisibilityRulesDto } from './dto/update-ui-visibility-rules.dto';
import { UiVisibilityScopeQueryDto } from './dto/ui-visibility-scope-query.dto';
import { getElementKeysForResource, isValidResource } from './ui-visibility.constants';

/**
 * ⚠️ Đọc PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md mục 2.1/2.2/3.4
 * trước khi sửa file này. Trục "UI Visibility" HOÀN TOÀN ĐỘC LẬP với
 * `PermissionsService` (Action Permission) dù dùng CHUNG thuật toán merge 3
 * tầng tuyến tính (Position -> Department -> Global) - KHÔNG dùng chung
 * cache map với `PermissionsService` (2 trục dữ liệu độc lập, tránh nhầm lẫn
 * khi debug sau này nếu gộp chung - xem PLAN mục 4.3).
 *
 * Default NGƯỢC với PermissionsService: bảng trống = MỌI field/tab đang HIỆN
 * (opt-out), không phải "không có dòng = không có quyền" như Action
 * Permission (xem JSDoc `UiVisibilityRule` entity).
 */

// Cache theo TỪNG INSTANCE serverless - cùng TTL với PermissionsService để
// nhất quán trải nghiệm "Admin sửa xong, tối đa chờ N giây là thấy hiệu lực".
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  hidden: Set<string>;
}

@Injectable()
export class UiVisibilityService {
  // key = `${roleCode}:${resource}:${departmentId ?? 'global'}:${positionId ?? 'nopos'}`
  private cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(UiVisibilityRule)
    private readonly ruleRepo: Repository<UiVisibilityRule>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Xoá cache - CÙNG CHỮ KÝ/logic với `PermissionsService.invalidate()` (xem
   * đó để biết lý do quét toàn bộ key thay vì dựng lại đúng 1 cacheKey).
   */
  invalidate(roleCode?: string, departmentId?: number | null, positionId?: number | null): void {
    if (!roleCode) {
      this.cache.clear();
      return;
    }
    if (departmentId === undefined && positionId === undefined) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${roleCode}:`)) this.cache.delete(key);
      }
      return;
    }
    const deptSegment = departmentId === undefined ? null : String(departmentId ?? 'global');
    const posSegment = positionId === undefined ? null : String(positionId ?? 'nopos');
    for (const key of this.cache.keys()) {
      const match = key.match(/^(.*):([^:]+):([^:]+):([^:]+)$/);
      if (!match) continue;
      const [, cachedRole, , cachedDept, cachedPos] = match;
      if (cachedRole !== roleCode) continue;
      if (deptSegment !== null && cachedDept !== deptSegment) continue;
      if (posSegment !== null && cachedPos !== posSegment) continue;
      this.cache.delete(key);
    }
  }

  private async loadHiddenKeysMap(
    roleCode: string,
    resource: string,
    departmentId?: number | null,
    positionId?: number | null,
  ): Promise<Set<string>> {
    const cacheKey = `${roleCode}:${resource}:${departmentId ?? 'global'}:${positionId ?? 'nopos'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.hidden;
    }

    // 3 tập ĐIỀU KIỆN RỜI NHAU - GIỐNG HỆT `PermissionsService.loadRolePermissionMap()`.
    const whereConditions: Array<Record<string, any>> = [
      { role: { code: roleCode }, resource, departmentId: IsNull(), positionId: IsNull() },
    ];
    if (departmentId) {
      whereConditions.push({
        role: { code: roleCode },
        resource,
        departmentId,
        positionId: IsNull(),
      });
    }
    if (positionId) {
      whereConditions.push({
        role: { code: roleCode },
        resource,
        positionId,
        departmentId: IsNull(),
      });
    }

    const rows = await this.ruleRepo.find({ where: whereConditions });

    const globalRows = rows.filter((r) => r.departmentId == null && r.positionId == null);
    const deptRows = rows.filter((r) => r.departmentId != null);
    const posRows = rows.filter((r) => r.positionId != null);

    const hidden = new Set<string>();
    // Merge TUẦN TỰ: Global -> Department -> Position (tầng sau đè tầng
    // trước) - `visible=true` XOÁ khỏi tập ẩn (mở lại), `visible=false` THÊM
    // vào tập ẩn - KHÔNG được đổi thứ tự 3 vòng lặp này.
    for (const r of [...globalRows, ...deptRows, ...posRows]) {
      if (r.visible) {
        hidden.delete(r.elementKey);
      } else {
        hidden.add(r.elementKey);
      }
    }

    this.cache.set(cacheKey, { hidden, expiresAt: Date.now() + CACHE_TTL_MS });
    return hidden;
  }

  /**
   * Tập `element_key` đang bị ẩn của 1 (role, resource), đã tính override
   * Department + Position. Role `admin` LUÔN trả về rỗng (bypass cứng, đúng
   * nguyên tắc "Admin không tự khoá mắt chính mình" - xem PLAN mục 2.4,
   * cùng tinh thần bypass admin ở `PermissionGuard`).
   */
  async getHiddenElementKeys(
    roleCode: string,
    resource: string,
    departmentId?: number | null,
    positionId?: number | null,
  ): Promise<Set<string>> {
    if (roleCode === Role.ADMIN) return new Set();
    if (!isValidResource(resource)) return new Set();
    return this.loadHiddenKeysMap(roleCode, resource, departmentId, positionId);
  }

  /** Dùng cho endpoint self-service `GET /ui-visibility/my-hidden`. */
  async getMyHiddenElements(
    roleCode: string,
    resource: string,
    departmentId?: number | null,
    positionId?: number | null,
  ): Promise<string[]> {
    const hidden = await this.getHiddenElementKeys(roleCode, resource, departmentId, positionId);
    return Array.from(hidden);
  }

  /**
   * Xoá field bị ẩn KHỎI object trả về (không set null - xem PLAN mục 2.5).
   * Dùng chung cho `findAll()`/`findOne()` của `CustomersService`. Mutate
   * trực tiếp object truyền vào (entity TypeORM đã build xong, chuẩn bị trả
   * về controller) - KHÔNG gọi `save()` sau bước này, KHÔNG ảnh hưởng DB.
   */
  stripHiddenCustomerFields<T extends Record<string, any>>(customer: T, hiddenKeys: Set<string>): T {
    if (hiddenKeys.size === 0) return customer;
    if (hiddenKeys.has('field:sales_assignment')) {
      delete customer.salesUserId;
      delete customer.salesUser;
      delete customer.activeAssignees;
    }
    if (hiddenKeys.has('field:marketing_assignment')) {
      delete customer.marketingUserId;
      delete customer.marketingUser;
    }
    if (hiddenKeys.has('field:assigned_date')) {
      delete customer.assignedDate;
    }
    if (hiddenKeys.has('field:closed_date')) {
      delete customer.closedDate;
    }
    return customer;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Admin CRUD (quyền `roles.manage`, tái dùng - xem PLAN mục 4.4) - dùng
  // cho tab "Hiển thị dữ liệu" ở trang /phan-quyen.
  // ══════════════════════════════════════════════════════════════════════

  private assertValidResource(resource: string): void {
    if (!isValidResource(resource)) {
      throw new BadRequestException(`Resource "${resource}" không hợp lệ`);
    }
  }

  private assertValidElementKeys(resource: string, elementKeys: string[]): void {
    const catalogue = getElementKeysForResource(resource) ?? [];
    for (const key of elementKeys) {
      if (!catalogue.includes(key)) {
        throw new BadRequestException(
          `element_key "${key}" không thuộc danh mục hợp lệ của resource "${resource}"`,
        );
      }
    }
  }

  private async getRoleOrThrow(roleId: number): Promise<RoleEntity> {
    const role = await this.roleRepo.findOneBy({ id: roleId });
    if (!role) throw new NotFoundException('Role không tồn tại');
    return role;
  }

  /**
   * Toàn bộ rule của 1 (role, resource) - Global + mọi override Department +
   * mọi override Position, gom sẵn theo nhóm để FE vẽ 1 lần đủ cả 3 tab,
   * không cần gọi 3 API riêng như `roles.controller.ts` đang làm cho Action
   * Permission (đơn giản hoá số lượng endpoint - xem PLAN mục 4.4).
   */
  async getRoleRules(roleId: number, resource: string) {
    await this.getRoleOrThrow(roleId);
    this.assertValidResource(resource);

    const rows = await this.ruleRepo.find({
      where: { roleId, resource },
      relations: ['department', 'position'],
    });

    const global = rows
      .filter((r) => r.departmentId == null && r.positionId == null)
      .map((r) => ({ elementKey: r.elementKey, visible: r.visible }));

    const deptGrouped = new Map<number, { departmentId: number; departmentName?: string; rules: { elementKey: string; visible: boolean }[] }>();
    for (const r of rows.filter((r) => r.departmentId != null)) {
      if (!deptGrouped.has(r.departmentId as number)) {
        deptGrouped.set(r.departmentId as number, {
          departmentId: r.departmentId as number,
          departmentName: r.department?.name,
          rules: [],
        });
      }
      deptGrouped.get(r.departmentId as number)!.rules.push({ elementKey: r.elementKey, visible: r.visible });
    }

    const posGrouped = new Map<number, { positionId: number; positionName?: string; rules: { elementKey: string; visible: boolean }[] }>();
    for (const r of rows.filter((r) => r.positionId != null)) {
      if (!posGrouped.has(r.positionId as number)) {
        posGrouped.set(r.positionId as number, {
          positionId: r.positionId as number,
          positionName: r.position?.name,
          rules: [],
        });
      }
      posGrouped.get(r.positionId as number)!.rules.push({ elementKey: r.elementKey, visible: r.visible });
    }

    return {
      resource,
      elementKeys: getElementKeysForResource(resource) ?? [],
      global,
      departmentOverrides: Array.from(deptGrouped.values()),
      positionOverrides: Array.from(posGrouped.values()),
    };
  }

  /**
   * Ghi đè TOÀN BỘ rule ở ĐÚNG 1 scope (global/1 phòng ban/1 vị trí, xác
   * định bởi `dto.departmentId`/`dto.positionId`, KHÔNG được set cả hai) -
   * cùng style "replace toàn bộ" với `RolesService.updateDepartmentOverride()`.
   */
  async upsertRoleRules(roleId: number, dto: UpdateUiVisibilityRulesDto) {
    const role = await this.getRoleOrThrow(roleId);
    this.assertValidResource(dto.resource);

    if (dto.departmentId != null && dto.positionId != null) {
      throw new BadRequestException(
        '1 rule chỉ được set departmentId HOẶC positionId, không cả hai (không phải ma trận tổ hợp Phòng ban x Vị trí)',
      );
    }
    if (dto.departmentId != null) {
      const dept = await this.departmentRepo.findOneBy({ id: dto.departmentId });
      if (!dept) throw new NotFoundException('Phòng ban không tồn tại');
    }
    if (dto.positionId != null) {
      const pos = await this.positionRepo.findOneBy({ id: dto.positionId });
      if (!pos) throw new NotFoundException('Vị trí không tồn tại');
    }
    this.assertValidElementKeys(dto.resource, dto.rules.map((r) => r.elementKey));

    const deleteCriteria: Record<string, any> = {
      roleId,
      resource: dto.resource,
      departmentId: dto.departmentId ?? IsNull(),
      positionId: dto.positionId ?? IsNull(),
    };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.delete(UiVisibilityRule, deleteCriteria);

      const newRows = dto.rules.map((r) =>
        queryRunner.manager.create(UiVisibilityRule, {
          roleId,
          resource: dto.resource,
          departmentId: dto.departmentId ?? null,
          positionId: dto.positionId ?? null,
          elementKey: r.elementKey,
          visible: r.visible,
        }),
      );
      await queryRunner.manager.save(newRows);
      await queryRunner.commitTransaction();

      this.invalidate(role.code, dto.departmentId ?? undefined, dto.positionId ?? undefined);

      return { success: true, count: newRows.length };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** Reset đúng 1 scope về mặc định (không còn rule nào -> mọi thứ HIỆN hết). */
  async deleteRoleRules(roleId: number, query: UiVisibilityScopeQueryDto) {
    const role = await this.getRoleOrThrow(roleId);
    this.assertValidResource(query.resource);

    if (query.departmentId != null && query.positionId != null) {
      throw new BadRequestException('Không được truyền cả departmentId lẫn positionId cùng lúc');
    }

    await this.ruleRepo.delete({
      roleId,
      resource: query.resource,
      departmentId: query.departmentId ?? IsNull(),
      positionId: query.positionId ?? IsNull(),
    });

    this.invalidate(role.code, query.departmentId ?? undefined, query.positionId ?? undefined);
    return { success: true };
  }
}
