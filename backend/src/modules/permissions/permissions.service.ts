import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';

/**
 * ⚠️ Đọc PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md mục 2.2/3.3
 * trước khi sửa file này. Thứ tự ưu tiên override LÀ TUYẾN TÍNH 3 TẦNG
 * (Position -> Department -> Global), KHÔNG PHẢI ma trận tổ hợp Phòng ban x
 * Vị trí - vì vậy khi resolve, dòng override Position được lọc theo
 * `positionId = user.positionId AND departmentId IS NULL` (KHÔNG cần khớp
 * `departmentId` của user), và dòng override Department được lọc theo
 * `departmentId = user.departmentId AND positionId IS NULL`.
 */

export interface ResolvedPermission {
  allowed: boolean;
  scope: PermissionScope | null;
}

// Cache theo TỪNG INSTANCE serverless
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  map: Map<string, PermissionScope | null>;
}

@Injectable()
export class PermissionsService {
  // key = `${roleCode}:${departmentId ?? 'global'}`
  private cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
  ) { }

  /**
   * Xoá cache. Nếu chỉ truyền roleCode, xoá TẤT CẢ entry cache có prefix đó
   * (mọi phòng ban/vị trí). Nếu truyền thêm departmentId/positionId, chỉ xoá
   * đúng entry đó.
   */
  invalidate(roleCode?: string, departmentId?: number | null, positionId?: number | null): void {
    if (roleCode) {
      if (departmentId !== undefined || positionId !== undefined) {
        const cacheKey = `${roleCode}:${departmentId ?? 'global'}:${positionId ?? 'nopos'}`;
        this.cache.delete(cacheKey);
      } else {
        // Xoá tất cả cache của roleCode này
        for (const key of this.cache.keys()) {
          if (key.startsWith(`${roleCode}:`)) {
            this.cache.delete(key);
          }
        }
      }
    } else {
      this.cache.clear();
    }
  }

  private async loadRolePermissionMap(
    roleCode: string,
    departmentId?: number | null,
    positionId?: number | null,
  ): Promise<Map<string, PermissionScope | null>> {
    const cacheKey = `${roleCode}:${departmentId ?? 'global'}:${positionId ?? 'nopos'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.map;
    }

    // 3 tập ĐIỀU KIỆN RỜI NHAU, đúng thiết kế tuyến tính 3 tầng (xem comment
    // đầu file) - KHÔNG gộp thành 1 điều kiện OR duy nhất để tránh lẫn dòng
    // override phòng ban với dòng override vị trí.
    const whereConditions: Array<Record<string, any>> = [
      { role: { code: roleCode }, departmentId: IsNull(), positionId: IsNull() },
    ];
    if (departmentId) {
      whereConditions.push({
        role: { code: roleCode },
        departmentId: departmentId,
        positionId: IsNull(),
      });
    }
    if (positionId) {
      whereConditions.push({
        role: { code: roleCode },
        positionId: positionId,
        departmentId: IsNull(),
      });
    }

    const rows = await this.rolePermissionRepo.find({
      where: whereConditions,
      relations: ['permission'],
    });

    const map = new Map<string, PermissionScope | null>();

    const globalRows = rows.filter((r) => r.departmentId == null && r.positionId == null);
    const deptRows = rows.filter((r) => r.departmentId != null);
    const posRows = rows.filter((r) => r.positionId != null);

    // Merge TUẦN TỰ đúng thứ tự ưu tiên: Global -> Department -> Position
    // (tầng merge SAU CÙNG thắng) - KHÔNG được đổi thứ tự 3 vòng lặp dưới
    // đây, đây chính là cách hiện thực hoá "Position ưu tiên cao nhất".
    for (const row of globalRows) {
      map.set(row.permission.key, row.scope);
    }
    for (const row of deptRows) {
      // scope='none' = dấu hiệu TỪ CHỐI TƯỜNG MINH của riêng phòng ban này
      // (xem comment PermissionScope.NONE) - XOÁ key khỏi map thay vì set,
      // để phòng ban này thật sự KHÔNG có quyền dù Toàn cục đang bật, thay
      // vì vô tình "set" giá trị 'none' làm scope hiệu lực (map.has() vẫn
      // true nhưng scope vô nghĩa) nếu chỉ set như các scope thật khác.
      if (row.scope === PermissionScope.NONE) {
        map.delete(row.permission.key);
      } else {
        map.set(row.permission.key, row.scope);
      }
    }
    for (const row of posRows) {
      // Cùng ý nghĩa sentinel NONE như deptRows, nhưng ở tầng ưu tiên cao
      // hơn - merge SAU deptRows nên luôn thắng, kể cả khi deptRows đang
      // "allow" cho permission này.
      if (row.scope === PermissionScope.NONE) {
        map.delete(row.permission.key);
      } else {
        map.set(row.permission.key, row.scope);
      }
    }

    this.cache.set(cacheKey, { map, expiresAt: Date.now() + CACHE_TTL_MS });
    return map;
  }

  /**
   * Kiểm tra 1 role có 1 permission hay không, kèm scope (có hỗ trợ override
   * theo phòng ban VÀ theo vị trí - Position ưu tiên cao hơn Department).
   */
  async hasPermission(
    roleCode: string,
    permissionKey: string,
    departmentId?: number | null,
    positionId?: number | null,
  ): Promise<ResolvedPermission> {
    const map = await this.loadRolePermissionMap(roleCode, departmentId, positionId);
    if (!map.has(permissionKey)) {
      return { allowed: false, scope: null };
    }
    return { allowed: true, scope: map.get(permissionKey) ?? null };
  }

  /**
   * Toàn bộ permission (+ scope) của 1 role, đã tính toán override phòng ban
   * VÀ override vị trí (nếu có).
   */
  async getRolePermissions(
    roleCode: string,
    departmentId?: number | null,
    positionId?: number | null,
  ): Promise<Map<string, PermissionScope | null>> {
    return this.loadRolePermissionMap(roleCode, departmentId, positionId);
  }
}