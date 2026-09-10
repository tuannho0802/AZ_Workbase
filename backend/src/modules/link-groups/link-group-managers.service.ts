import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkGroupSecondaryManager } from '../../database/entities/link-group-secondary-manager.entity';
import { LinkGroupContentStaff } from '../../database/entities/link-group-content-staff.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { LinkGroupAccessHelper } from './helpers/link-group-access.helper';
import { PermissionsService } from '../permissions/permissions.service';

export interface GroupManagersResult {
  groupId: number;
  groupName: string;
  primaryManager: { id: number; name: string; email: string; role: string } | null;
  secondaryManagers: Array<{ id: number; name: string; email: string; role: string; addedAt: Date }>;
  // "Nhân viên Content" - cùng shape với secondaryManagers, xem
  // LinkGroupContentStaff.
  contentStaff: Array<{ id: number; name: string; email: string; role: string; addedAt: Date }>;
}

@Injectable()
export class LinkGroupManagersService {
  constructor(
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    @InjectRepository(LinkGroupSecondaryManager)
    private readonly secondaryRepo: Repository<LinkGroupSecondaryManager>,
    @InjectRepository(LinkGroupContentStaff)
    private readonly contentStaffRepo: Repository<LinkGroupContentStaff>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * "Quyền rộng" cho tính năng Quản lý chính/phụ - true nếu role được thấy/
   * sửa MỌI nhóm bất kể có phải chính/phụ của nhóm đó hay không.
   *
   * ⚠️ SỬA BUG (xem giải thích đầy đủ ở JSDoc `LinkGroupAccessHelper`), ĐÃ
   * ĐỔI theo migration `AddIsRootAdminToUsers1781000000000` (đồng bộ với
   * `PermissionGuard`/`RolesService.getMyPermissions()`):
   * - CHỈ Root Admin (`requesterRole === Role.ADMIN && requesterIsRootAdmin
   *   === true`) luôn `true` - LỐI THOÁT HIỂM cứng, không phụ thuộc DB, admin
   *   không bao giờ bị khoá bởi cấu hình `role_permissions` sai/thiếu.
   * - Role khác, KỂ CẢ Admin thường (`role=admin` nhưng `isRootAdmin=false`),
   *   tra thật `role_permissions` qua `PermissionsService.hasPermission()`
   *   cho permission `link_groups.manage` - CÙNG permission đã dùng để gác
   *   `link-categories.controller.ts`/`link-groups.controller.ts` (CRUD
   *   Category/Group nói chung), tái dùng đúng 1 nguồn quyền, không tạo
   *   permission key riêng cho tính năng này.
   */
  private async hasBroadAccess(
    requesterRole: string,
    requesterDepartmentId?: number | null,
    requesterIsRootAdmin?: boolean,
  ): Promise<boolean> {
    if (requesterRole === Role.ADMIN && requesterIsRootAdmin) return true;
    const { allowed } = await this.permissionsService.hasPermission(
      requesterRole,
      'link_groups.manage',
      requesterDepartmentId
    );
    return allowed;
  }

  /**
   * Nạp 1 group KÈM quan hệ primaryManager + secondaryManagers (dùng chung
   * cho mọi thao tác bên dưới - luôn cần đủ dữ liệu này để check quyền).
   */
  private async loadGroupWithManagers(groupId: number): Promise<LinkGroup> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId },
      relations: [
        'primaryManager',
        'secondaryManagers',
        'secondaryManagers.user',
        'contentStaff',
        'contentStaff.user',
      ],
    });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm này');
    }
    return group;
  }

  private toResult(group: LinkGroup): GroupManagersResult {
    return {
      groupId: group.id,
      groupName: group.name,
      primaryManager: group.primaryManager
        ? {
            id: group.primaryManager.id,
            name: group.primaryManager.name,
            email: group.primaryManager.email,
            role: group.primaryManager.role,
          }
        : null,
      secondaryManagers: (group.secondaryManagers ?? [])
        .filter((m) => m.user) // phòng trường hợp user bị xoá cứng - relation null, không nên xảy ra vì onDelete CASCADE nhưng vẫn phòng thủ
        .map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.user.role,
          addedAt: m.createdAt,
        })),
      contentStaff: (group.contentStaff ?? [])
        .filter((m) => m.user)
        .map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.user.role,
          addedAt: m.createdAt,
        })),
    };
  }

  /**
   * Danh sách group mà `requesterId` được XEM trong tính năng này - ADMIN
   * thấy TẤT CẢ, user thường CHỈ thấy group mình là quản lý chính hoặc phụ.
   * Đây chính là API phục vụ trang "Quản lý nhóm liên kết" hiển thị đúng
   * theo yêu cầu: "chỉ hiển thị cho user nào được gán chính và phụ thôi".
   */
  async listManagedByMe(requesterId: number, requesterRole: string, requesterIsRootAdmin?: boolean): Promise<GroupManagersResult[]> {
    let groups: LinkGroup[];

    const fullRelations = [
      'primaryManager',
      'secondaryManagers',
      'secondaryManagers.user',
      'contentStaff',
      'contentStaff.user',
      'category',
    ];

    if (await this.hasBroadAccess(requesterRole, undefined, requesterIsRootAdmin)) {
      groups = await this.groupRepo.find({
        relations: fullRelations,
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    } else {
      // 3 nhánh: group mình là primary, group mình có mặt trong
      // secondary_managers, HOẶC group mình có mặt trong content_staff -
      // gộp lại, loại trùng (trường hợp hiếm nhưng valid: bị gán nhiều vai
      // trò cùng lúc, vd trước là phụ giờ lên chính mà chưa kịp gỡ khỏi
      // bảng phụ, hoặc vừa là phụ vừa là content).
      const joinRowRelations = [
        'group',
        'group.primaryManager',
        'group.secondaryManagers',
        'group.secondaryManagers.user',
        'group.contentStaff',
        'group.contentStaff.user',
        'group.category',
      ];

      const asPrimary = await this.groupRepo.find({
        where: { primaryManagerId: requesterId },
        relations: fullRelations,
      });
      const secondaryRows = await this.secondaryRepo.find({
        where: { userId: requesterId },
        relations: joinRowRelations,
      });
      const asSecondary = secondaryRows.map((r) => r.group);
      const contentRows = await this.contentStaffRepo.find({
        where: { userId: requesterId },
        relations: joinRowRelations,
      });
      const asContentStaff = contentRows.map((r) => r.group);

      const byId = new Map<number, LinkGroup>();
      for (const g of [...asPrimary, ...asSecondary, ...asContentStaff]) byId.set(g.id, g);
      groups = Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }

    return groups.map((g) => this.toResult(g));
  }

  /**
   * Xem quản lý chính/phụ của 1 group cụ thể - CHỈ admin/chính/phụ của
   * group đó mới xem được (đúng yêu cầu: user không liên quan không thấy
   * gì cả, kể cả xem).
   */
  async getManagers(groupId: number, requesterId: number, requesterRole: string, requesterIsRootAdmin?: boolean): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);
    const secondaryIds = (group.secondaryManagers ?? []).map((m) => m.userId);
    const contentStaffIds = (group.contentStaff ?? []).map((m) => m.userId);

    if (
      !LinkGroupAccessHelper.canManage(
        requesterId,
        await this.hasBroadAccess(requesterRole, undefined, requesterIsRootAdmin),
        group.primaryManagerId,
        secondaryIds,
        contentStaffIds,
      )
    ) {
      throw new ForbiddenException('Bạn không phải quản lý (chính/phụ) hoặc Nhân viên Content của nhóm này nên không có quyền xem');
    }

    return this.toResult(group);
  }

  /**
   * Thêm 1 quản lý phụ - CHỈ admin hoặc CHÍNH quản lý chính của group đó.
   */
  async addSecondaryManager(
    groupId: number,
    userId: number,
    requesterId: number,
    requesterRole: string,
    requesterIsRootAdmin?: boolean,
  ): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);

    if (
      !LinkGroupAccessHelper.canEditSecondaryManagers(
        requesterId,
        await this.hasBroadAccess(requesterRole, undefined, requesterIsRootAdmin),
        group.primaryManagerId,
      )
    ) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc admin) mới có quyền thêm Quản lý phụ cho nhóm này');
    }

    if (group.primaryManagerId === userId) {
      throw new BadRequestException('Người này đang là Quản lý chính của nhóm - không thể vừa là chính vừa là phụ');
    }

    const alreadySecondary = (group.secondaryManagers ?? []).some((m) => m.userId === userId);
    if (alreadySecondary) {
      throw new ConflictException('Người này đã là Quản lý phụ của nhóm rồi');
    }

    const targetUser = await this.userRepo.findOneBy({ id: userId, isActive: true });
    if (!targetUser) {
      throw new BadRequestException(`Nhân viên ID ${userId} không tồn tại hoặc đã bị khóa`);
    }

    const created = this.secondaryRepo.create({
      groupId,
      userId,
      addedById: requesterId,
    });
    await this.secondaryRepo.save(created);

    return this.getManagers(groupId, requesterId, requesterRole, requesterIsRootAdmin);
  }

  /**
   * Gỡ 1 quản lý phụ - CHỈ admin hoặc CHÍNH quản lý chính của group đó.
   */
  async removeSecondaryManager(
    groupId: number,
    userId: number,
    requesterId: number,
    requesterRole: string,
    requesterIsRootAdmin?: boolean,
  ): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);

    if (
      !LinkGroupAccessHelper.canEditSecondaryManagers(
        requesterId,
        await this.hasBroadAccess(requesterRole, undefined, requesterIsRootAdmin),
        group.primaryManagerId,
      )
    ) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc admin) mới có quyền xoá Quản lý phụ của nhóm này');
    }

    const existing = (group.secondaryManagers ?? []).find((m) => m.userId === userId);
    if (!existing) {
      throw new NotFoundException('Người này không phải Quản lý phụ của nhóm - không có gì để xoá');
    }

    await this.secondaryRepo.remove(existing);

    return this.getManagers(groupId, requesterId, requesterRole, requesterIsRootAdmin);
  }

  /**
   * Thêm 1 Nhân viên Content - CÙNG RULE với Quản lý phụ: CHỈ admin hoặc
   * CHÍNH quản lý chính của group đó (tái dùng `canEditSecondaryManagers`,
   * không tạo rule riêng - xem JSDoc `LinkGroupContentStaff`).
   *
   * KHÔNG chặn nếu người này đã là Quản lý phụ - 1 user được phép VỪA là
   * Quản lý phụ VỪA là Nhân viên Content của cùng 1 group (2 vai trò không
   * loại trừ nhau, xem JSDoc entity).
   */
  async addContentStaff(
    groupId: number,
    userId: number,
    requesterId: number,
    requesterRole: string,
    requesterIsRootAdmin?: boolean,
  ): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);

    if (
      !LinkGroupAccessHelper.canEditSecondaryManagers(
        requesterId,
        await this.hasBroadAccess(requesterRole, undefined, requesterIsRootAdmin),
        group.primaryManagerId,
      )
    ) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc admin) mới có quyền thêm Nhân viên Content cho nhóm này');
    }

    if (group.primaryManagerId === userId) {
      throw new BadRequestException('Người này đang là Quản lý chính của nhóm - không thể vừa là chính vừa là Nhân viên Content');
    }

    const alreadyContentStaff = (group.contentStaff ?? []).some((m) => m.userId === userId);
    if (alreadyContentStaff) {
      throw new ConflictException('Người này đã là Nhân viên Content của nhóm rồi');
    }

    const targetUser = await this.userRepo.findOneBy({ id: userId, isActive: true });
    if (!targetUser) {
      throw new BadRequestException(`Nhân viên ID ${userId} không tồn tại hoặc đã bị khóa`);
    }

    const created = this.contentStaffRepo.create({
      groupId,
      userId,
      addedById: requesterId,
    });
    await this.contentStaffRepo.save(created);

    return this.getManagers(groupId, requesterId, requesterRole, requesterIsRootAdmin);
  }

  /**
   * Gỡ 1 Nhân viên Content - CHỈ admin hoặc CHÍNH quản lý chính của group đó.
   */
  async removeContentStaff(
    groupId: number,
    userId: number,
    requesterId: number,
    requesterRole: string,
    requesterIsRootAdmin?: boolean,
  ): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);

    if (
      !LinkGroupAccessHelper.canEditSecondaryManagers(
        requesterId,
        await this.hasBroadAccess(requesterRole, undefined, requesterIsRootAdmin),
        group.primaryManagerId,
      )
    ) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc admin) mới có quyền xoá Nhân viên Content của nhóm này');
    }

    const existing = (group.contentStaff ?? []).find((m) => m.userId === userId);
    if (!existing) {
      throw new NotFoundException('Người này không phải Nhân viên Content của nhóm - không có gì để xoá');
    }

    await this.contentStaffRepo.remove(existing);

    return this.getManagers(groupId, requesterId, requesterRole, requesterIsRootAdmin);
  }
}