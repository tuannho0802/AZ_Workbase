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
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { LinkGroupAccessHelper } from './helpers/link-group-access.helper';

export interface GroupManagersResult {
  groupId: number;
  groupName: string;
  primaryManager: { id: number; name: string; email: string; role: string } | null;
  secondaryManagers: Array<{ id: number; name: string; email: string; role: string; addedAt: Date }>;
}

@Injectable()
export class LinkGroupManagersService {
  constructor(
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    @InjectRepository(LinkGroupSecondaryManager)
    private readonly secondaryRepo: Repository<LinkGroupSecondaryManager>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Nạp 1 group KÈM quan hệ primaryManager + secondaryManagers (dùng chung
   * cho mọi thao tác bên dưới - luôn cần đủ dữ liệu này để check quyền).
   */
  private async loadGroupWithManagers(groupId: number): Promise<LinkGroup> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId },
      relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
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
    };
  }

  /**
   * Danh sách group mà `requesterId` được XEM trong tính năng này - ADMIN
   * thấy TẤT CẢ, user thường CHỈ thấy group mình là quản lý chính hoặc phụ.
   * Đây chính là API phục vụ trang "Quản lý nhóm liên kết" hiển thị đúng
   * theo yêu cầu: "chỉ hiển thị cho user nào được gán chính và phụ thôi".
   */
  async listManagedByMe(requesterId: number, requesterRole: string): Promise<GroupManagersResult[]> {
    let groups: LinkGroup[];

    if (requesterRole === Role.ADMIN) {
      groups = await this.groupRepo.find({
        relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user', 'category'],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    } else {
      // 2 nhánh: group mình là primary, HOẶC group mình có mặt trong
      // secondary_managers - gộp lại, loại trùng (trường hợp hiếm nhưng
      // valid: bị gán cả 2 vai trò cùng lúc, vd trước là phụ giờ lên chính
      // mà chưa kịp gỡ khỏi bảng phụ).
      const asPrimary = await this.groupRepo.find({
        where: { primaryManagerId: requesterId },
        relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user', 'category'],
      });
      const secondaryRows = await this.secondaryRepo.find({
        where: { userId: requesterId },
        relations: ['group', 'group.primaryManager', 'group.secondaryManagers', 'group.secondaryManagers.user', 'group.category'],
      });
      const asSecondary = secondaryRows.map((r) => r.group);

      const byId = new Map<number, LinkGroup>();
      for (const g of [...asPrimary, ...asSecondary]) byId.set(g.id, g);
      groups = Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }

    return groups.map((g) => this.toResult(g));
  }

  /**
   * Xem quản lý chính/phụ của 1 group cụ thể - CHỈ admin/chính/phụ của
   * group đó mới xem được (đúng yêu cầu: user không liên quan không thấy
   * gì cả, kể cả xem).
   */
  async getManagers(groupId: number, requesterId: number, requesterRole: string): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);
    const secondaryIds = (group.secondaryManagers ?? []).map((m) => m.userId);

    if (!LinkGroupAccessHelper.canManage(requesterId, requesterRole, group.primaryManagerId, secondaryIds)) {
      throw new ForbiddenException('Bạn không phải quản lý (chính/phụ) của nhóm này nên không có quyền xem');
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
  ): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);

    if (!LinkGroupAccessHelper.canEditSecondaryManagers(requesterId, requesterRole, group.primaryManagerId)) {
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

    return this.getManagers(groupId, requesterId, requesterRole);
  }

  /**
   * Gỡ 1 quản lý phụ - CHỈ admin hoặc CHÍNH quản lý chính của group đó.
   */
  async removeSecondaryManager(
    groupId: number,
    userId: number,
    requesterId: number,
    requesterRole: string,
  ): Promise<GroupManagersResult> {
    const group = await this.loadGroupWithManagers(groupId);

    if (!LinkGroupAccessHelper.canEditSecondaryManagers(requesterId, requesterRole, group.primaryManagerId)) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc admin) mới có quyền xoá Quản lý phụ của nhóm này');
    }

    const existing = (group.secondaryManagers ?? []).find((m) => m.userId === userId);
    if (!existing) {
      throw new NotFoundException('Người này không phải Quản lý phụ của nhóm - không có gì để xoá');
    }

    await this.secondaryRepo.remove(existing);

    return this.getManagers(groupId, requesterId, requesterRole);
  }
}
