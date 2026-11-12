import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpagePostType } from '../../database/entities/fanpage-post-type.entity';
import { AuditService } from '../audit/audit.service';
import { CreateFanpagePostTypeDto, UpdateFanpagePostTypeDto } from './dto/fanpage-post-type.dto';

/**
 * Danh mục Loại bài (E5a) - mirror `FanpageHealthStatusesService`: thêm/sửa/KHOÁ, KHÔNG xoá (bài cũ vẫn tham chiếu).
 * Không có dòng \"mặc định\": bài chưa phân loại = `post_type_id` NULL.
 */
@Injectable()
export class FanpagePostTypesService {
    constructor(
        @InjectRepository(FanpagePostType)
        private readonly repo: Repository<FanpagePostType>,
        private readonly auditService: AuditService,
    ) { }

    /** activeOnly=true -> chỉ loại chưa khoá (dropdown chọn cho bài). Kèm số bài đang dùng. */
    async findAll(activeOnly = false) {
        const qb = this.repo
            .createQueryBuilder('t')
            .loadRelationCountAndMap('t.postCount', 't.posts')
            .orderBy('t.sortOrder', 'ASC')
            .addOrderBy('t.id', 'ASC');
        // BooleanTransformer không chạy trong QueryBuilder.where -> truyền 0.
        if (activeOnly) qb.where('t.isLocked = :l', { l: 0 });
        return qb.getMany();
    }

    async create(dto: CreateFanpagePostTypeDto, callerId: number): Promise<FanpagePostType> {
        const name = dto.name.trim();
        await this.assertNameFree(name);
        const saved = await this.repo.save(
            this.repo.create({ name, color: dto.color ?? '#1677ff', isLocked: false, sortOrder: dto.sortOrder ?? 0 }),
        );
        this.auditService.logActionAsync(callerId, 'CREATE_FANPAGE_POST_TYPE', 'fanpage_post_type', saved.id, null, saved);
        return saved;
    }

    async update(id: number, dto: UpdateFanpagePostTypeDto, callerId: number): Promise<FanpagePostType> {
        const type = await this.load(id);
        const before = { ...type };
        if (dto.name !== undefined && dto.name.trim() !== type.name) {
            await this.assertNameFree(dto.name.trim(), id);
            type.name = dto.name.trim();
        }
        if (dto.color !== undefined) type.color = dto.color;
        if (dto.sortOrder !== undefined) type.sortOrder = dto.sortOrder;
        const saved = await this.repo.save(type);
        this.auditService.logActionAsync(callerId, 'UPDATE_FANPAGE_POST_TYPE', 'fanpage_post_type', id, before, saved);
        return saved;
    }

    async lock(id: number, callerId: number): Promise<FanpagePostType> {
        const type = await this.load(id);
        type.isLocked = true;
        const saved = await this.repo.save(type);
        this.auditService.logActionAsync(callerId, 'LOCK_FANPAGE_POST_TYPE', 'fanpage_post_type', id, null, { id, name: saved.name, isLocked: true });
        return saved;
    }

    async unlock(id: number, callerId: number): Promise<FanpagePostType> {
        const type = await this.load(id);
        type.isLocked = false;
        const saved = await this.repo.save(type);
        this.auditService.logActionAsync(callerId, 'UNLOCK_FANPAGE_POST_TYPE', 'fanpage_post_type', id, null, { id, name: saved.name, isLocked: false });
        return saved;
    }

    private async load(id: number): Promise<FanpagePostType> {
        const type = await this.repo.findOne({ where: { id } });
        if (!type) throw new NotFoundException('Không tìm thấy loại bài này');
        return type;
    }

    private async assertNameFree(name: string, exceptId?: number): Promise<void> {
        const existing = await this.repo.findOne({ where: { name }, select: ['id'] });
        if (existing && existing.id !== exceptId) throw new ConflictException(`Loại bài "${name}" đã tồn tại`);
    }
}