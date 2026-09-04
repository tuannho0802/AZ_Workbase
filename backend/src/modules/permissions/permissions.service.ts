import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';

export interface ResolvedPermission {
  allowed: boolean;
  scope: PermissionScope | null;
}

// Cache theo TỪNG INSTANCE serverless (Vercel chạy nhiều instance song
// song, không share memory) - invalidate() gọi từ RolesService chỉ xoá
// đúng cache của instance đang xử lý request đó, KHÔNG lan sang các
// instance khác đang giữ bản cache cũ. TTL ngắn là lớp an toàn CHÍNH cho
// tính đúng đắn đa-instance - invalidate() chỉ là tối ưu "instance vừa sửa
// thấy ngay lập tức", không phải cơ chế duy nhất đảm bảo đúng.
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  map: Map<string, PermissionScope | null>;
}

@Injectable()
export class PermissionsService {
  // key = role code (vd 'admin', 'mkt_manager')
  private cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
  ) { }

  /** Xoá cache 1 role cụ thể (gọi ngay sau khi RolesService sửa ma trận
   * quyền của role đó) - hoặc xoá TOÀN BỘ cache nếu không truyền roleCode
   * (dùng khi sửa danh mục permissions, ảnh hưởng nhiều role cùng lúc). */
  invalidate(roleCode?: string): void {
    if (roleCode) {
      this.cache.delete(roleCode);
    } else {
      this.cache.clear();
    }
  }

  private async loadRolePermissionMap(roleCode: string): Promise<Map<string, PermissionScope | null>> {
    const cached = this.cache.get(roleCode);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.map;
    }

    const rows = await this.rolePermissionRepo.find({
      where: { role: { code: roleCode } },
      relations: ['permission'],
    });

    const map = new Map<string, PermissionScope | null>();
    for (const row of rows) {
      map.set(row.permission.key, row.scope);
    }

    this.cache.set(roleCode, { map, expiresAt: Date.now() + CACHE_TTL_MS });
    return map;
  }

  /**
   * Kiểm tra 1 role có 1 permission hay không, kèm scope (nếu permission đó
   * có hỗ trợ scope). `allowed=false` khi role không có dòng nào cho
   * permission này trong role_permissions (xem thiết kế ở
   * role-permission.entity.ts - không có dòng = không có quyền).
   */
  async hasPermission(roleCode: string, permissionKey: string): Promise<ResolvedPermission> {
    const map = await this.loadRolePermissionMap(roleCode);
    if (!map.has(permissionKey)) {
      return { allowed: false, scope: null };
    }
    return { allowed: true, scope: map.get(permissionKey) ?? null };
  }

  /** Toàn bộ permission (+ scope) của 1 role - dùng để trả về FE hiển thị
   * ma trận, hoặc để 1 service cần check nhiều permission cùng lúc mà
   * không muốn query lặp lại nhiều lần. */
  async getRolePermissions(roleCode: string): Promise<Map<string, PermissionScope | null>> {
    return this.loadRolePermissionMap(roleCode);
  }
}