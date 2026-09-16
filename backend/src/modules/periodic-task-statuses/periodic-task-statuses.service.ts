import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { CreatePeriodicTaskStatusDto } from './dto/create-periodic-task-status.dto';
import { UpdatePeriodicTaskStatusDto } from './dto/update-periodic-task-status.dto';
import { AuditService } from '../audit/audit.service';

/**
 * PeriodicTaskStatusesService - CRUD "Trạng thái Công việc định kỳ", mirror
 * PATTERN của `CustomerStatusesService`/`LeaveTypesService` (Admin tự CRUD,
 * không ENUM cứng - PLAN mục 0 + 3).
 *
 * ⚠️ KHÁC 2 mẫu trên ở 1 điểm quan trọng: `periodic_tasks.status_id` là FK
 * THẬT (`ON DELETE RESTRICT`), không phải cột free-text rời rạc như
 * `customers.status`/`leave_requests.leave_type` - nên "đang dùng" được đếm
 * qua `status_id` (số), và khi xoá kèm fallback phải chuyển
 * `periodic_tasks.status_id` sang ID khác (không phải `code` khác) TRƯỚC khi
 * DELETE, nếu không FK RESTRICT sẽ tự chặn (an toàn hơn, nhưng vẫn cần logic
 * transaction ở tầng ứng dụng để trải nghiệm xoá mượt như 2 mẫu gốc).
 */
@Injectable()
export class PeriodicTaskStatusesService {
  constructor(
    @InjectRepository(PeriodicTaskStatus)
    private readonly statusRepo: Repository<PeriodicTaskStatus>,
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<(PeriodicTaskStatus & { inUseCount: number })[]> {
    const statuses = await this.statusRepo.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (statuses.length === 0) return [];

    const counts = await this.taskRepo
      .createQueryBuilder('task')
      .select('task.statusId', 'statusId')
      .addSelect('COUNT(*)', 'count')
      .where('task.deletedAt IS NULL')
      .groupBy('task.statusId')
      .getRawMany<{ statusId: number; count: string }>();
    const countMap = new Map(counts.map((c) => [Number(c.statusId), Number(c.count)]));

    return statuses.map((s) => ({ ...s, inUseCount: countMap.get(s.id) ?? 0 }));
  }

  async findOne(id: number): Promise<PeriodicTaskStatus> {
    const status = await this.statusRepo.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Không tìm thấy trạng thái với ID ${id}`);
    }
    return status;
  }

  async create(dto: CreatePeriodicTaskStatusDto, callerId?: number): Promise<PeriodicTaskStatus> {
    const existing = await this.statusRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Mã trạng thái "${dto.code}" đã tồn tại`);
    }

    const status = this.statusRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      color: dto.color ?? '#1890ff',
      sortOrder: dto.sortOrder ?? 0,
      isDoneState: dto.isDoneState ?? false,
      isExcludedFromRollup: dto.isExcludedFromRollup ?? false,
    });
    const saved = await this.statusRepo.save(status);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'CREATE_PERIODIC_TASK_STATUS', 'periodic_task_status', saved.id, null, saved);
    }
    return saved;
  }

  async update(id: number, dto: UpdatePeriodicTaskStatusDto, callerId?: number): Promise<PeriodicTaskStatus> {
    const status = await this.findOne(id);
    const before = { ...status };

    if (dto.name !== undefined) status.name = dto.name;
    if (dto.description !== undefined) status.description = dto.description ?? null;
    if (dto.color !== undefined) status.color = dto.color;
    if (dto.sortOrder !== undefined) status.sortOrder = dto.sortOrder;
    if (dto.isDoneState !== undefined) status.isDoneState = dto.isDoneState;
    if (dto.isExcludedFromRollup !== undefined) status.isExcludedFromRollup = dto.isExcludedFromRollup;

    const saved = await this.statusRepo.save(status);
    if (callerId) {
      this.auditService.logActionAsync(callerId, 'UPDATE_PERIODIC_TASK_STATUS', 'periodic_task_status', saved.id, before, saved);
    }
    return saved;
  }

  /**
   * ⚠️ KHÔNG xoá trạng thái hệ thống (`isSystem = true`, 3 giá trị seed từ
   * `CreatePeriodicTaskStatuses1781900000000`) - mirror
   * `CustomerStatusesService.remove()`. Trạng thái tuỳ chỉnh đang có Task
   * dùng (`periodic_tasks.status_id`, FK thật) cho phép xoá kèm
   * "fallbackStatusId": mọi Task đang có `status_id = id cũ` được chuyển
   * sang `fallbackStatusId` do người dùng chọn TRƯỚC khi status cũ bị xoá -
   * tránh để FK RESTRICT chặn giữa chừng, và tránh phải tự sửa từng Task.
   *
   * `fallbackStatusId` CHƯA truyền + đang có Task dùng -> ném lỗi rõ ràng
   * (kèm số lượng) để FE hiện modal bắt chọn, KHÔNG tự ý chọn hộ 1 fallback
   * mặc định nào - quyết định nghiệp vụ, phải do người xoá chọn.
   */
  async remove(id: number, fallbackStatusId?: number, callerId?: number): Promise<{ deleted: true; reassignedCount: number }> {
    const status = await this.findOne(id);

    if (status.isSystem) {
      throw new BadRequestException(`Không thể xoá trạng thái hệ thống "${status.name}"`);
    }

    // TypeORM tự thêm điều kiện `deletedAt IS NULL` cho entity có
    // `@DeleteDateColumn` (soft delete) - không cần khai thêm tường minh.
    const inUseCount = await this.taskRepo.count({ where: { statusId: status.id } });

    let fallbackStatus: PeriodicTaskStatus | null = null;
    if (inUseCount > 0) {
      if (!fallbackStatusId) {
        throw new BadRequestException(
          `Đang có ${inUseCount} Công việc định kỳ dùng trạng thái "${status.name}". ` +
          'Vui lòng chọn trạng thái thay thế (fallbackStatusId) để chuyển dữ liệu trước khi xoá.',
        );
      }
      if (fallbackStatusId === status.id) {
        throw new BadRequestException('Trạng thái thay thế không được trùng với trạng thái đang xoá');
      }
      fallbackStatus = await this.statusRepo.findOne({ where: { id: fallbackStatusId } });
      if (!fallbackStatus) {
        throw new BadRequestException(`Trạng thái thay thế với ID ${fallbackStatusId} không tồn tại`);
      }
    }

    // Transaction: chuyển status_id của Task (nếu có) + xoá status phải
    // cùng thành công hoặc cùng rollback - tránh trạng thái nửa vời.
    await this.statusRepo.manager.transaction(async (manager) => {
      if (inUseCount > 0 && fallbackStatus) {
        await manager.update(PeriodicTask, { statusId: status.id }, { statusId: fallbackStatus.id });
      }
      await manager.remove(PeriodicTaskStatus, status);
    });

    if (callerId) {
      this.auditService.logActionAsync(callerId, 'DELETE_PERIODIC_TASK_STATUS', 'periodic_task_status', id, status, { reassignedCount: inUseCount });
    }

    return { deleted: true, reassignedCount: inUseCount };
  }
}