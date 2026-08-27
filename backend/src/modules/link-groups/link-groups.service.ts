import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CreateLinkGroupDto } from './dto/create-link-group.dto';
import { UpdateLinkGroupDto } from './dto/update-link-group.dto';

@Injectable()
export class LinkGroupsService {
  constructor(
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    @InjectRepository(LinkCategory)
    private readonly categoryRepo: Repository<LinkCategory>,
    @InjectRepository(CustomerGroupMembership)
    private readonly membershipRepo: Repository<CustomerGroupMembership>,
  ) {}

  /**
   * @param categoryId lọc theo 1 category cụ thể (optional).
   * @param activeOnly true = chỉ trả group CHƯA ẩn (isActive=true).
   */
  async findAll(categoryId?: number, activeOnly = false): Promise<LinkGroup[]> {
    return this.groupRepo.find({
      where: {
        ...(categoryId != null ? { categoryId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      relations: ['category'],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async create(dto: CreateLinkGroupDto): Promise<LinkGroup> {
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

    const created = this.groupRepo.create({
      categoryId: dto.categoryId,
      name: dto.name,
      url: dto.url,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.groupRepo.save(created);
  }

  async update(id: number, dto: UpdateLinkGroupDto): Promise<LinkGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm này');
    }

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

    return this.groupRepo.save(group);
  }

  async setActive(id: number, isActive: boolean): Promise<LinkGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm này');
    }
    group.isActive = isActive;
    return this.groupRepo.save(group);
  }

  async remove(id: number): Promise<{ deleted: true }> {
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

    await this.groupRepo.remove(group);
    return { deleted: true };
  }
}
