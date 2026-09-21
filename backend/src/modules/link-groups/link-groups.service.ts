import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { User } from '../../database/entities/user.entity';
import { CreateLinkGroupDto } from './dto/create-link-group.dto';
import { UpdateLinkGroupDto } from './dto/update-link-group.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LinkGroupsService {
  constructor(
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    @InjectRepository(LinkCategory)
    private readonly categoryRepo: Repository<LinkCategory>,
    @InjectRepository(CustomerGroupMembership)
    private readonly membershipRepo: Repository<CustomerGroupMembership>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * @param categoryId lọc theo 1 category cụ thể (optional).
   * @param activeOnly true = chỉ trả group CHƯA ẩn (isActive=true).
   *
   * ⚠️ Endpoint public cho MỌI user đã đăng nhập (dùng cho checklist "tham
   * gia nhóm" khi tạo/sửa khách hàng) - KHÔNG áp permission theo
   * primary/secondary manager ở đây. Muốn xem CHỈ nhóm mình quản lý, dùng
   * `LinkGroupManagersService.listManagedByMe()` (GET /link-groups/managed-by-me).
   */
  async findAll(categoryId?: number, activeOnly = false): Promise<LinkGroup[]> {
    return this.groupRepo.find({
      where: {
        ...(categoryId != null ? { categoryId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      // ⚠️ BỔ SUNG `contentStaff`/`contentStaff.user` (2026-09-08): trang
      // "Quản lý nhóm liên kết" (FE) cần đếm/hiển thị số Nhân viên Content
      // của từng nhóm ngay trên bảng danh sách (cột riêng, giống cách đang
      // hiển thị `+N phụ` cho secondaryManagers) - nếu thiếu relation này ở
      // đây, FE luôn nhận mảng rỗng dù DB đã có dữ liệu (không phải bug ở
      // FE, mà do BE không nạp quan hệ này trong `findAll`, chỉ nạp trong
      // `LinkGroupManagersService` phục vụ Modal riêng).
      relations: [
        'category',
        'primaryManager',
        'secondaryManagers',
        'secondaryManagers.user',
        'contentStaff',
        'contentStaff.user',
      ],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  private async validatePrimaryManagerId(primaryManagerId: number | null | undefined): Promise<void> {
    if (primaryManagerId == null) return; // null/undefined = không gán hoặc bỏ gán, hợp lệ
    const user = await this.userRepo.findOneBy({ id: primaryManagerId, isActive: true });
    if (!user) {
      throw new BadRequestException(`Nhân viên ID ${primaryManagerId} không tồn tại hoặc đã bị khóa`);
    }
  }

  async create(dto: CreateLinkGroupDto, callerId?: number): Promise<LinkGroup> {
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) {
      throw new NotFoundException('Không tìm thấy category này');
    }

    const existing = await this.groupRepo.findOne({
      where: { categoryId: dto.categoryId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Nhóm "${dto.name}" đã tồn tại trong category "${category.name}"`);
    }

    await this.validatePrimaryManagerId(dto.primaryManagerId);

    const created = this.groupRepo.create({
      categoryId: dto.categoryId,
      name: dto.name,
      url: dto.url,
      sortOrder: dto.sortOrder ?? 0,
      primaryManagerId: dto.primaryManagerId ?? null,
    });
    const saved = await this.groupRepo.save(created);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'CREATE_LINK_GROUP', 'link_group', saved.id, null, saved);
    }
    return saved;
  }

  async update(id: number, dto: UpdateLinkGroupDto, callerId?: number): Promise<LinkGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm này');
    }
    const before = { ...group };

    if (dto.name && dto.name !== group.name) {
      const existing = await this.groupRepo.findOne({
        where: { categoryId: group.categoryId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`Nhóm "${dto.name}" đã tồn tại trong category này`);
      }
      group.name = dto.name;
    }
    if (dto.url !== undefined) group.url = dto.url;
    if (dto.sortOrder !== undefined) group.sortOrder = dto.sortOrder;
    if (dto.primaryManagerId !== undefined) {
      await this.validatePrimaryManagerId(dto.primaryManagerId);
      group.primaryManagerId = dto.primaryManagerId;
    }

    const saved = await this.groupRepo.save(group);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'UPDATE_LINK_GROUP', 'link_group', saved.id, before, saved);
    }
    return saved;
  }

  async setActive(id: number, isActive: boolean, callerId?: number): Promise<LinkGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm này');
    }
    const before = { id: group.id, name: group.name, isActive: group.isActive };
    group.isActive = isActive;
    const saved = await this.groupRepo.save(group);
    if (callerId) {
      this.auditService.logActionAsync(
        callerId,
        isActive ? 'ACTIVATE_LINK_GROUP' : 'DEACTIVATE_LINK_GROUP',
        'link_group',
        saved.id,
        before,
        { id: saved.id, name: saved.name, isActive: saved.isActive },
      );
    }
    return saved;
  }

  async remove(id: number, callerId?: number): Promise<{ deleted: true }> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm này');
    }

    const membershipCount = await this.membershipRepo.count({ where: { groupId: id } });
    if (membershipCount > 0) {
      throw new BadRequestException(
        `Không thể xoá "${group.name}" vì đang có ${membershipCount} khách hàng có dữ liệu "đã join" gắn với nhóm này. Hãy dùng chức năng Ẩn thay vì Xoá.`,
      );
    }

    // [AUDIT] `repo.remove(entity)` của TypeORM XOÁ `id` khỏi object sau khi
    // xoá -> phải chụp snapshot TRƯỚC khi gọi remove().
    const snapshot = { ...group };
    await this.groupRepo.remove(group);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'DELETE_LINK_GROUP', 'link_group', id, snapshot, null);
    }
    return { deleted: true };
  }
}