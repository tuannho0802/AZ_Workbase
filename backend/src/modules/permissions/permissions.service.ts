import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';

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
   * Xoá cache. Nếu chỉ truyền roleCode, xoá TẤT CẢ entry cache có prefix đó (mọi phòng ban).
   */
  invalidate(roleCode?: string, departmentId?: number | null): void {
    if (roleCode) {
      if (departmentId !== undefined) {
        const cacheKey = `${roleCode}:${departmentId ?? 'global'}`;
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

  private async loadRolePermissionMap(roleCode: string, departmentId?: number | null): Promise<Map<string, PermissionScope | null>> {
    const cacheKey = `${roleCode}:${departmentId ?? 'global'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.map;
    }

    const whereConditions = departmentId
      ? [
          { role: { code: roleCode }, departmentId: departmentId },
          { role: { code: roleCode }, departmentId: IsNull() },
        ]
      : [{ role: { code: roleCode }, departmentId: IsNull() }];

    const rows = await this.rolePermissionRepo.find({
      where: whereConditions,
      relations: ['permission'],
    });

    const map = new Map<string, PermissionScope | null>();
    
    // Xử lý ghi đè: nếu có 2 dòng (global null và override phòng ban),
    // ta nên ưu tiên dòng có departmentId != null.
    // Vì vậy ta insert dòng null trước, dòng departmentId đè lên sau.
    const globalRows = rows.filter(r => r.departmentId == null);
    const deptRows = rows.filter(r => r.departmentId != null);

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

    this.cache.set(cacheKey, { map, expiresAt: Date.now() + CACHE_TTL_MS });
    return map;
  }

  /**
   * Kiểm tra 1 role có 1 permission hay không, kèm scope (có hỗ trợ override phòng ban).
   */
  async hasPermission(roleCode: string, permissionKey: string, departmentId?: number | null): Promise<ResolvedPermission> {
    const map = await this.loadRolePermissionMap(roleCode, departmentId);
    if (!map.has(permissionKey)) {
      return { allowed: false, scope: null };
    }
    return { allowed: true, scope: map.get(permissionKey) ?? null };
  }

  /**
   * Toàn bộ permission (+ scope) của 1 role, đã tính toán override phòng ban (nếu có).
   */
  async getRolePermissions(roleCode: string, departmentId?: number | null): Promise<Map<string, PermissionScope | null>> {
    return this.loadRolePermissionMap(roleCode, departmentId);
  }
}