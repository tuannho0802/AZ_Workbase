import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { CreateLinkCategoryDto } from './dto/create-link-category.dto';
import { UpdateLinkCategoryDto } from './dto/update-link-category.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LinkCategoriesService {
  constructor(
    @InjectRepository(LinkCategory)
    private readonly categoryRepo: Repository<LinkCategory>,
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * @param activeOnly true = chỉ trả category CHƯA khoá (dùng cho dropdown
   * chọn category khi tạo Group mới). false/undefined = trả TẤT CẢ (trang
   * quản lý - admin cần thấy cả category đã khoá).
   */
  async findAll(activeOnly = false): Promise<LinkCategory[]> {
    return this.categoryRepo.find({
      where: activeOnly ? { isLocked: false } : {},
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async create(dto: CreateLinkCategoryDto, callerId?: number): Promise<LinkCategory> {
    const existing = await this.categoryRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Category "${dto.name}" đã tồn tại`);
    }
    const created = this.categoryRepo.create({
      name: dto.name,
      color: dto.color ?? '#1677ff',
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.categoryRepo.save(created);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'CREATE_LINK_CATEGORY', 'link_category', saved.id, null, saved);
    }
    return saved;
  }

  async update(id: number, dto: UpdateLinkCategoryDto, callerId?: number): Promise<LinkCategory> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Không tìm thấy category này');
    }
    const before = { ...category };

    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoryRepo.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException(`Category "${dto.name}" đã tồn tại`);
      }
      category.name = dto.name;
    }
    if (dto.color !== undefined) category.color = dto.color;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;

    const saved = await this.categoryRepo.save(category);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'UPDATE_LINK_CATEGORY', 'link_category', saved.id, before, saved);
    }
    return saved;
  }

  async setLocked(id: number, isLocked: boolean, callerId?: number): Promise<LinkCategory> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Không tìm thấy category này');
    }
    const before = { id: category.id, name: category.name, isLocked: category.isLocked };
    category.isLocked = isLocked;
    const saved = await this.categoryRepo.save(category);
    if (callerId) {
      this.auditService.logActionAsync(
        callerId,
        isLocked ? 'LOCK_LINK_CATEGORY' : 'UNLOCK_LINK_CATEGORY',
        'link_category',
        saved.id,
        before,
        { id: saved.id, name: saved.name, isLocked: saved.isLocked },
      );
    }
    return saved;
  }

  async remove(id: number, callerId?: number): Promise<{ deleted: true }> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Không tìm thấy category này');
    }

    const groupCount = await this.groupRepo.count({ where: { categoryId: id } });
    if (groupCount > 0) {
      throw new BadRequestException(
        `Không thể xoá "${category.name}" vì đang có ${groupCount} nhóm thuộc category này. Hãy xoá/chuyển các nhóm đó trước, hoặc dùng chức năng Khoá.`,
      );
    }

    // [AUDIT] chụp snapshot TRƯỚC remove() (TypeORM xoá `id` khỏi entity sau khi xoá).
    const snapshot = { ...category };
    await this.categoryRepo.remove(category);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'DELETE_LINK_CATEGORY', 'link_category', id, snapshot, null);
    }
    return { deleted: true };
  }
}
