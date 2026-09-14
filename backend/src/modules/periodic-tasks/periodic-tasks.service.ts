import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { User } from '../../database/entities/user.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { DepartmentManagerHelper } from '../departments/helpers/department-manager.helper';
import { CreatePeriodicTaskDto } from './dto/create-periodic-task.dto';
import { UpdatePeriodicTaskDto } from './dto/update-periodic-task.dto';
import { PeriodicTaskFiltersDto } from './dto/periodic-task-filters.dto';
import { PeriodicTaskAccessHelper } from './helpers/periodic-task-access.helper';

/**
 * PeriodicTasksService - Phase 1 (PLAN mục 6): Status catalog + Task CRUD cơ
 * bản + RBAC view/create/edit/delete. CHƯA có liên kết cha-con
 * (`periodic_task_links` - Phase 2), Customer (`periodic_task_customers` -
 * Phase 3), phụ trách phụ (`periodic_task_secondary_assignees` - Phase 4),
 * lock/approve (Phase 5) - cố tình để giữ Phase 1 nhỏ, dễ review.
 */
@Injectable()
export class PeriodicTasksService {
  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    @InjectRepository(PeriodicTaskStatus)
    private readonly statusRepo: Repository<PeriodicTaskStatus>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(DepartmentManager)
    private readonly departmentManagerRepo: Repository<DepartmentManager>,
  ) {}

  /**
   * Trạng thái mặc định khi tạo Task không truyền `statusId` - dùng đúng
   * status hệ thống `code='not_started'` seed sẵn ở
   * `CreatePeriodicTaskStatuses1781900000000`.
   */
  private async getDefaultStatusId(): Promise<number> {
    const defaultStatus = await this.statusRepo.findOne({ where: { code: 'not_started' } });
    if (!defaultStatus) {
      throw new BadRequestException(
        'Không tìm thấy trạng thái mặc định "not_started" - hệ thống Trạng thái công việc định kỳ chưa được khởi tạo đúng',
      );
    }
    return defaultStatus.id;
  }

  private async assertStatusExists(statusId: number): Promise<void> {
    const exists = await this.statusRepo.findOne({ where: { id: statusId } });
    if (!exists) {
      throw new BadRequestException(`Trạng thái với ID ${statusId} không tồn tại`);
    }
  }

  private async assertUserExists(userId: number, fieldLabel: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });
    if (!user) {
      throw new BadRequestException(`${fieldLabel} với ID ${userId} không tồn tại hoặc đã bị khóa`);
    }
    return user;
  }

  private assertPeriodDatesValid(periodStartDate: string, periodEndDate: string): void {
    if (new Date(periodEndDate) < new Date(periodStartDate)) {
      throw new BadRequestException('periodEndDate không được nhỏ hơn periodStartDate');
    }
  }

  async create(dto: CreatePeriodicTaskDto, userId: number): Promise<PeriodicTask> {
    this.assertPeriodDatesValid(dto.periodStartDate, dto.periodEndDate);

    const primaryAssignee = await this.assertUserExists(dto.primaryAssigneeId, 'Người phụ trách chính');

    const statusId = dto.statusId ?? (await this.getDefaultStatusId());
    if (dto.statusId) {
      await this.assertStatusExists(dto.statusId);
    }

    // Auto-fill departmentId từ phòng ban của primaryAssignee lúc tạo nếu
    // không truyền - CHỈ là giá trị khởi tạo, sửa tự do sau đó (PLAN mục 2.10).
    const departmentId = dto.departmentId ?? primaryAssignee.departmentId ?? null;

    const task = this.taskRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      periodType: dto.periodType,
      periodStartDate: dto.periodStartDate,
      periodEndDate: dto.periodEndDate,
      statusId,
      primaryAssigneeId: dto.primaryAssigneeId,
      departmentId,
      createdById: userId,
      note: dto.note ?? null,
      color: dto.color ?? null,
    });

    return this.taskRepo.save(task);
  }

  async findAll(filters: PeriodicTaskFiltersDto, userId: number, userRole: string, scope?: string | null) {
    const {
      page = 1,
      limit = 20,
      periodType,
      periodStartDate,
      dateFrom,
      dateTo,
      statusId,
      primaryAssigneeId,
      departmentId,
      search,
    } = filters;

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.updatedBy', 'updatedBy')
      .where('task.deletedAt IS NULL');

    PeriodicTaskAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    // Khớp CHÍNH XÁC 1 kỳ (PLAN mục 2.11).
    if (periodType) {
      qb.andWhere('task.periodType = :periodType', { periodType });
    }
    if (periodStartDate) {
      qb.andWhere('task.periodStartDate = :periodStartDate', { periodStartDate });
    }

    // Khớp theo KHOẢNG (range, overlap) - kết hợp AND được với điều kiện trên.
    if (dateFrom) {
      qb.andWhere('task.periodEndDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('task.periodStartDate <= :dateTo', { dateTo });
    }

    if (statusId) {
      qb.andWhere('task.statusId = :statusId', { statusId });
    }
    if (primaryAssigneeId) {
      qb.andWhere('task.primaryAssigneeId = :primaryAssigneeId', { primaryAssigneeId });
    }
    if (departmentId) {
      qb.andWhere('task.departmentId = :departmentId', { departmentId });
    }
    if (search) {
      qb.andWhere('task.title LIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('task.periodStartDate', 'DESC').addOrderBy('task.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number, userId: number, userRole: string, scope?: string | null): Promise<PeriodicTask> {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.updatedBy', 'updatedBy')
      .where('task.id = :id', { id })
      .andWhere('task.deletedAt IS NULL');

    PeriodicTaskAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    const task = await qb.getOne();
    if (!task) {
      throw new NotFoundException(`Không tìm thấy Công việc định kỳ với ID ${id}`);
    }
    return task;
  }

  /**
   * ⚠️ Nguyên tắc "1 cổng gác" (đúng PLAN mục 5): PATCH luôn gọi findOne()
   * (đã áp `PeriodicTaskAccessHelper.applyViewFilter`) TRƯỚC khi sửa - Task
   * ngoài phạm vi scope sẽ tự 404 trước khi kịp chạm bước update, không cần
   * thêm 1 bộ điều kiện "canUpdate" riêng dễ lệch khỏi applyViewFilter.
   */
  async update(
    id: number,
    dto: UpdatePeriodicTaskDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<PeriodicTask> {
    const task = await this.findOne(id, userId, userRole, scope);

    if (dto.periodStartDate !== undefined || dto.periodEndDate !== undefined) {
      this.assertPeriodDatesValid(
        dto.periodStartDate ?? task.periodStartDate,
        dto.periodEndDate ?? task.periodEndDate,
      );
    }

    if (dto.primaryAssigneeId !== undefined) {
      await this.assertUserExists(dto.primaryAssigneeId, 'Người phụ trách chính');
      task.primaryAssigneeId = dto.primaryAssigneeId;
    }

    if (dto.statusId !== undefined) {
      await this.assertStatusExists(dto.statusId);
      task.statusId = dto.statusId;
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.periodType !== undefined) task.periodType = dto.periodType;
    if (dto.periodStartDate !== undefined) task.periodStartDate = dto.periodStartDate;
    if (dto.periodEndDate !== undefined) task.periodEndDate = dto.periodEndDate;
    // Sửa tự do sau khi tạo, kể cả về null (PLAN mục 2.10) - CHỈ áp dụng khi
    // field THẬT SỰ có mặt trong body (không phải "undefined nghĩa là xoá").
    if (dto.departmentId !== undefined) task.departmentId = dto.departmentId;
    if (dto.note !== undefined) task.note = dto.note ?? null;
    if (dto.color !== undefined) task.color = dto.color ?? null;

    task.updatedById = userId;

    return this.taskRepo.save(task);
  }

  /**
   * Xoá mềm - CHỈ Admin (PLAN mục 2.7, mirror `customers.delete`). Vẫn gọi
   * `findOne()` trước để 404 đúng cách nếu Task không tồn tại/đã xoá, sau đó
   * mới kiểm tra quyền Admin qua `PeriodicTaskAccessHelper.canDelete()`.
   */
  async remove(id: number, userId: number, userRole: string): Promise<{ deleted: true }> {
    // Admin có scope='all' cho `periodic_tasks.view` theo seed mặc định nên
    // truyền scope='all' ở đây là AN TOÀN cho luồng xoá (chỉ Admin gọi được
    // route này do @RequirePermission('periodic_tasks.delete') đã chặn ở
    // Controller/PermissionGuard trước khi chạm Service).
    const task = await this.findOne(id, userId, userRole, 'all');

    if (!PeriodicTaskAccessHelper.canDelete(task, userId, userRole)) {
      throw new ForbiddenException('Chỉ Admin mới có quyền xoá Công việc định kỳ');
    }

    await this.taskRepo.softDelete(id);
    return { deleted: true };
  }

  /** Dùng nội bộ Phase 2 (rollup) - lấy danh sách id phòng ban user đang quản lý. */
  async getManagedDepartmentIds(userId: number): Promise<number[]> {
    return DepartmentManagerHelper.getManagedDepartmentIds(this.departmentManagerRepo, userId);
  }
}