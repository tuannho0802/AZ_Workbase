import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RoleEntity } from '../../database/entities/role.entity';
import { Permission } from '../../database/entities/permission.entity';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';
import { User } from '../../database/entities/user.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { PermissionsService } from '../permissions/permissions.service';

// Permission "chìa khoá" - phải LUÔN còn ít nhất 1 role nắm giữ, nếu không
// sẽ không còn ai (kể cả Admin) có thể tự mở lại trang Phân quyền để sửa
// sai - phải can thiệp thẳng vào DB. Đây là permission DUY NHẤT có luật an
// toàn này (không áp dụng chung cho mọi permission khác - Admin được toàn
// quyền tự khoá nhầm các quyền khác, tự chịu trách nhiệm, chỉ riêng lối
// thoát quản trị này được bảo vệ cứng).
const GUARDIAN_PERMISSION_KEY = 'roles.manage';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
  ) {}

  async findAllRoles() {
    const roles = await this.roleRepo.find({ order: { isSystem: 'DESC', id: 'ASC' } });
    const allPermissions = await this.rolePermissionRepo.find({ relations: ['permission'] });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: allPermissions
        .filter((rp) => rp.roleId === role.id)
        .map((rp) => ({ permissionKey: rp.permission.key, scope: rp.scope })),
    }));
  }

  async findAllPermissions() {
    const permissions = await this.permissionRepo.find({ order: { resource: 'ASC', action: 'ASC' } });
    return permissions.map((p) => ({
      key: p.key,
      resource: p.resource,
      action: p.action,
      supportsScope: p.supportsScope,
      description: p.description,
    }));
  }

  async createRole(dto: CreateRoleDto) {
    const existing = await this.roleRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Mã role "${dto.code}" đã tồn tại`);
    }

    const role = this.roleRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
    });
    return this.roleRepo.save(role);
  }

  async updateRole(id: number, dto: UpdateRoleDto) {
    const role = await this.getRoleOrThrow(id);

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;

    const saved = await this.roleRepo.save(role);
    // Đổi `name` không ảnh hưởng logic phân quyền (chỉ đổi chữ hiển thị),
    // nhưng invalidate cho chắc - tránh 1 nhánh code nào đó lỡ cache luôn cả
    // object role (không chỉ map permission) trong tương lai.
    this.permissionsService.invalidate(role.code);
    return saved;
  }

  async deleteRole(id: number) {
    const role = await this.getRoleOrThrow(id);

    if (role.isSystem) {
      throw new BadRequestException(
        `Không thể xoá role hệ thống "${role.name}" (${role.code}).`,
      );
    }

    const usersWithRole = await this.userRepo.count({ where: { role: role.code } });
    if (usersWithRole > 0) {
      throw new ConflictException(
        `Không thể xoá role "${role.name}" - đang có ${usersWithRole} nhân viên được gán role này. Đổi role cho họ trước.`,
      );
    }

    await this.roleRepo.remove(role);
    this.permissionsService.invalidate(role.code);
  }

  async updateRolePermissions(id: number, dto: UpdateRolePermissionsDto) {
    const role = await this.getRoleOrThrow(id);

    const allPermissions = await this.permissionRepo.find();
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

    // Validate từng dòng TRƯỚC khi động vào DB - fail sớm, không ghi dở dang.
    for (const entry of dto.permissions) {
      const permission = permissionByKey.get(entry.permissionKey);
      if (!permission) {
        throw new BadRequestException(`Permission "${entry.permissionKey}" không tồn tại`);
      }
      if (permission.supportsScope && !entry.scope) {
        throw new BadRequestException(
          `Permission "${entry.permissionKey}" bắt buộc phải chọn phạm vi (scope)`,
        );
      }
      if (!permission.supportsScope && entry.scope) {
        throw new BadRequestException(
          `Permission "${entry.permissionKey}" không hỗ trợ phạm vi (scope) - để trống`,
        );
      }
    }

    // ⚠️ AN TOÀN CHỐNG KHOÁ TRANG: nếu update này gỡ "roles.manage" khỏi
    // role hiện tại, phải đảm bảo còn role KHÁC giữ quyền đó - nếu không,
    // không ai (kể cả Admin) còn cách nào tự sửa lại phân quyền qua UI nữa.
    const willHaveGuardian = dto.permissions.some((e) => e.permissionKey === GUARDIAN_PERMISSION_KEY);
    if (!willHaveGuardian) {
      const guardianPermission = permissionByKey.get(GUARDIAN_PERMISSION_KEY);
      if (guardianPermission) {
        const otherHolders = await this.rolePermissionRepo.count({
          where: { permissionId: guardianPermission.id },
        });
        // otherHolders đếm CẢ role đang sửa (chưa xoá) - nếu <= 1 nghĩa là
        // role đang sửa là nơi DUY NHẤT giữ quyền này -> chặn.
        const currentRoleHoldsIt = await this.rolePermissionRepo.exists({
          where: { roleId: id, permissionId: guardianPermission.id },
        });
        if (currentRoleHoldsIt && otherHolders <= 1) {
          throw new BadRequestException(
            'Không thể gỡ quyền "Quản lý phân quyền" khỏi role này - đây là role DUY NHẤT còn giữ quyền này. Hãy gán quyền đó cho 1 role khác trước.',
          );
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId: id });
      const rows = dto.permissions.map((entry) =>
        manager.create(RolePermission, {
          roleId: id,
          permissionId: permissionByKey.get(entry.permissionKey)!.id,
          scope: entry.scope ?? null,
        }),
      );
      if (rows.length > 0) {
        await manager.save(RolePermission, rows);
      }
    });

    this.permissionsService.invalidate(role.code);
    return this.findAllRoles().then((roles) => roles.find((r) => r.id === id));
  }

  private async getRoleOrThrow(id: number): Promise<RoleEntity> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Không tìm thấy role ID ${id}`);
    }
    return role;
  }

  /**
   * Quyền của CHÍNH role đang gọi - dùng để FE tự quyết định hiện/ẩn UI
   * (sidebar, trang chủ, nút bấm...) khớp đúng những gì BE thật sự cho
   * phép, KHÔNG hardcode danh sách role ở FE. Route này KHÔNG cần
   * `roles.view` (ai cũng có quyền biết quyền của chính mình - nếu bắt
   * buộc `roles.view` thì user không có quyền đó sẽ không cách nào tự biết
   * mình thiếu quyền gì, kể cả để FE ẩn đúng những mục họ không có).
   */
  async getMyPermissions(roleCode: string): Promise<Record<string, PermissionScope | null>> {
    const map = await this.permissionsService.getRolePermissions(roleCode);
    return Object.fromEntries(map);
  }
}