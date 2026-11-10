import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpagePlatform } from '../../database/entities/fanpage-platform.entity';
import { AuditService } from '../audit/audit.service';
import { CreateFanpagePlatformDto, UpdateFanpagePlatformDto } from './dto/fanpage-platform.dto';

@Injectable()
export class FanpagePlatformsService {
    constructor(
        @InjectRepository(FanpagePlatform)
        private readonly repo: Repository<FanpagePlatform>,
        private readonly auditService: AuditService,
    ) { }

    /** activeOnly=true -> chỉ nền tảng chưa khoá (dropdown tạo Page mới). Kèm số Page đang dùng. */
    async findAll(activeOnly = false) {
        const qb = this.repo
            .createQueryBuilder('p')
            .loadRelationCountAndMap('p.fanpageCount', 'p.fanpages')
            .orderBy('p.sortOrder', 'ASC')
            .addOrderBy('p.id', 'ASC');
        // BooleanTransformer không chạy trong QueryBuilder.where -> truyền 1.
        if (activeOnly) qb.where('p.isActive = :a', { a: 1 });
        return qb.getMany();
    }

    async create(dto: CreateFanpagePlatformDto, callerId: number): Promise<FanpagePlatform> {
        await this.assertNameFree(dto.name.trim());
        const saved = await this.repo.save(
            this.repo.create({ name: dto.name.trim(), color: dto.color ?? '#1677ff', sortOrder: dto.sortOrder ?? 0 }),
        );
        this.auditService.logActionAsync(callerId, 'CREATE_FANPAGE_PLATFORM', 'fanpage_platform', saved.id, null, saved);
        return saved;
    }

    async update(id: number, dto: UpdateFanpagePlatformDto, callerId: number): Promise<FanpagePlatform> {
        const platform = await this.load(id);
        const before = { ...platform };
        if (dto.name !== undefined && dto.name.trim() !== platform.name) {
            await this.assertNameFree(dto.name.trim(), id);
            platform.name = dto.name.trim();
        }
        if (dto.color !== undefined) platform.color = dto.color;
        if (dto.sortOrder !== undefined) platform.sortOrder = dto.sortOrder;
        const saved = await this.repo.save(platform);
        this.auditService.logActionAsync(callerId, 'UPDATE_FANPAGE_PLATFORM', 'fanpage_platform', id, before, saved);
        return saved;
    }

    async lock(id: number, callerId: number): Promise<FanpagePlatform> {
        const platform = await this.load(id);
        platform.isActive = false;
        const saved = await this.repo.save(platform);
        this.auditService.logActionAsync(callerId, 'LOCK_FANPAGE_PLATFORM', 'fanpage_platform', id, null, { id, name: saved.name, isActive: false });
        return saved;
    }

    async unlock(id: number, callerId: number): Promise<FanpagePlatform> {
        const platform = await this.load(id);
        platform.isActive = true;
        const saved = await this.repo.save(platform);
        this.auditService.logActionAsync(callerId, 'UNLOCK_FANPAGE_PLATFORM', 'fanpage_platform', id, null, { id, name: saved.name, isActive: true });
        return saved;
    }

    private async load(id: number): Promise<FanpagePlatform> {
        const platform = await this.repo.findOne({ where: { id } });
        if (!platform) throw new NotFoundException('Không tìm thấy nền tảng này');
        return platform;
    }

    private async assertNameFree(name: string, exceptId?: number): Promise<void> {
        const existing = await this.repo.findOne({ where: { name }, select: ['id'] });
        if (existing && existing.id !== exceptId) throw new ConflictException(`Nền tảng "${name}" đã tồn tại`);
    }
}