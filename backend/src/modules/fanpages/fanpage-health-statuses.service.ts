import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpageHealthStatus } from '../../database/entities/fanpage-health-status.entity';
import { AuditService } from '../audit/audit.service';
import { CreateFanpageHealthStatusDto, UpdateFanpageHealthStatusDto } from './dto/fanpage-health-status.dto';

/**
 * Danh mục Tình trạng Page - mirror `FanpagePlatformsService`: thêm/sửa/KHOÁ, KHÔNG xoá.
 * Dòng mặc định (`is_default`, gán cho Page mới) không khoá được và không được đặt `is_blocking` (Page mới sẽ bị loại khỏi KPI).
 */
@Injectable()
export class FanpageHealthStatusesService {
    constructor(
        @InjectRepository(FanpageHealthStatus)
        private readonly repo: Repository<FanpageHealthStatus>,
        private readonly auditService: AuditService,
    ) { }

    /** activeOnly=true -> chỉ tình trạng chưa khoá (dropdown chọn cho Page). Kèm số Page đang dùng. */
    async findAll(activeOnly = false) {
        const qb = this.repo
            .createQueryBuilder('h')
            .loadRelationCountAndMap('h.fanpageCount', 'h.fanpages')
            .orderBy('h.sortOrder', 'ASC')
            .addOrderBy('h.id', 'ASC');
        // BooleanTransformer không chạy trong QueryBuilder.where -> truyền 0.
        if (activeOnly) qb.where('h.isLocked = :l', { l: 0 });
        return qb.getMany();
    }

    /** Tình trạng gán cho Page mới. null nếu bảng chưa seed (Page mới sẽ không có tình trạng - coi như không chặn). */
    async getDefault(): Promise<FanpageHealthStatus | null> {
        return this.repo.findOne({ where: { isDefault: true }, order: { id: 'ASC' } });
    }

    async create(dto: CreateFanpageHealthStatusDto, callerId: number): Promise<FanpageHealthStatus> {
        await this.assertNameFree(dto.name.trim());
        const saved = await this.repo.save(
            this.repo.create({
                name: dto.name.trim(),
                color: dto.color ?? '#52c41a',
                isBlocking: dto.isBlocking ?? false,
                isDefault: false,
                isLocked: false,
                sortOrder: dto.sortOrder ?? 0,
            }),
        );
        this.auditService.logActionAsync(callerId, 'CREATE_FANPAGE_HEALTH_STATUS', 'fanpage_health_status', saved.id, null, saved);
        return saved;
    }

    async update(id: number, dto: UpdateFanpageHealthStatusDto, callerId: number): Promise<FanpageHealthStatus> {
        const status = await this.load(id);
        const before = { ...status };
        if (dto.name !== undefined && dto.name.trim() !== status.name) {
            await this.assertNameFree(dto.name.trim(), id);
            status.name = dto.name.trim();
        }
        if (dto.color !== undefined) status.color = dto.color;
        if (dto.sortOrder !== undefined) status.sortOrder = dto.sortOrder;
        if (dto.isBlocking !== undefined) {
            if (dto.isBlocking && status.isDefault) {
                throw new BadRequestException('Tình trạng mặc định không được đặt là "ngưng hoạt động" (Page mới sẽ bị loại khỏi KPI)');
            }
            status.isBlocking = dto.isBlocking;
        }
        const saved = await this.repo.save(status);
        this.auditService.logActionAsync(callerId, 'UPDATE_FANPAGE_HEALTH_STATUS', 'fanpage_health_status', id, before, saved);
        return saved;
    }

    async lock(id: number, callerId: number): Promise<FanpageHealthStatus> {
        const status = await this.load(id);
        if (status.isDefault) throw new BadRequestException('Không thể khoá tình trạng mặc định (đang gán cho Page mới)');
        status.isLocked = true;
        const saved = await this.repo.save(status);
        this.auditService.logActionAsync(callerId, 'LOCK_FANPAGE_HEALTH_STATUS', 'fanpage_health_status', id, null, { id, name: saved.name, isLocked: true });
        return saved;
    }

    async unlock(id: number, callerId: number): Promise<FanpageHealthStatus> {
        const status = await this.load(id);
        status.isLocked = false;
        const saved = await this.repo.save(status);
        this.auditService.logActionAsync(callerId, 'UNLOCK_FANPAGE_HEALTH_STATUS', 'fanpage_health_status', id, null, { id, name: saved.name, isLocked: false });
        return saved;
    }

    private async load(id: number): Promise<FanpageHealthStatus> {
        const status = await this.repo.findOne({ where: { id } });
        if (!status) throw new NotFoundException('Không tìm thấy tình trạng này');
        return status;
    }

    private async assertNameFree(name: string, exceptId?: number): Promise<void> {
        const existing = await this.repo.findOne({ where: { name }, select: ['id'] });
        if (existing && existing.id !== exceptId) throw new ConflictException(`Tình trạng "${name}" đã tồn tại`);
    }
}