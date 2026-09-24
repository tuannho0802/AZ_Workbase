import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { PeriodicTaskAuditAction, PeriodicTaskAuditService } from './periodic-task-audit.service';
import { PeriodicTaskTrashFiltersDto } from './dto/periodic-task-trash.dto';

/**
 * Thùng rác Công việc định kỳ - CHỈ 3 việc, gate bằng 1 permission duy nhất
 * `periodic_tasks.trash_manage` (nhị phân, mặc định chỉ Admin):
 *  1. `getTrash()`      - liệt kê Task đã xoá mềm (`deleted_at IS NOT NULL`).
 *  2. `hardDelete()`    - xoá VĨNH VIỄN các Task đã chọn (chỉ nhận Task ĐÃ xoá mềm).
 *  3. `emptyTrash()`    - xoá vĩnh viễn TOÀN BỘ Task đã xoá mềm.
 *  4. `restore()`       - KHÔI PHỤC các Task đã chọn (`deleted_at = NULL`), ghi log `restored`
 *                        vào lịch sử riêng của từng Task (Task sống lại nên log còn nguyên).
 *
 * Các bảng con (checklist, liên kết cha-con, gắn Khách hàng, Phụ trách phụ,
 * `periodic_task_audit_logs`) đều `ON DELETE CASCADE` theo `task_id` nên tự dọn
 * theo - KHÔNG thể khôi phục. Mọi lần xoá đều ghi 1 dòng vào `audit_logs` chung
 * (log riêng theo Task cũng bị cascade nên không thể ghi ở đó).
 */
@Injectable()
export class PeriodicTaskTrashService {
  private readonly logger = new Logger(PeriodicTaskTrashService.name);

  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    @InjectRepository(PeriodicTaskAuditLog)
    private readonly auditLogRepo: Repository<PeriodicTaskAuditLog>,
    private readonly auditService: AuditService,
    private readonly periodicTaskAuditService: PeriodicTaskAuditService,
  ) {}

  async getTrash(dto: PeriodicTaskTrashFiltersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .withDeleted() // gồm cả bản ghi xoá mềm
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .where('task.deletedAt IS NOT NULL');

    if (dto.search?.trim()) {
      qb.andWhere('task.title LIKE :search', { search: `%${dto.search.trim()}%` });
    }

    qb.orderBy('task.deletedAt', 'DESC')
      .addOrderBy('task.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [tasks, total] = await qb.getManyAndCount();

    // Bảng `periodic_tasks` không có cột deleted_by - lấy người xoá từ log
    // `deleted` của chính Task (còn nguyên vì mới xoá mềm).
    const deleterByTask = new Map<number, { id: number; name: string }>();
    if (tasks.length > 0) {
      const logs = await this.auditLogRepo.find({
        where: { taskId: In(tasks.map((t) => t.id)), action: PeriodicTaskAuditAction.DELETED },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });
      for (const log of logs) {
        if (!deleterByTask.has(log.taskId) && log.user) {
          deleterByTask.set(log.taskId, { id: log.user.id, name: log.user.name });
        }
      }
    }

    return {
      data: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        periodType: t.periodType,
        periodStartDate: t.periodStartDate,
        periodEndDate: t.periodEndDate,
        color: t.color,
        status: t.status ? { id: t.status.id, name: t.status.name, color: t.status.color } : null,
        primaryAssignee: t.primaryAssignee ? { id: t.primaryAssignee.id, name: t.primaryAssignee.name } : null,
        department: t.department ? { id: t.department.id, name: t.department.name, color: t.department.color } : null,
        createdBy: t.createdBy ? { id: t.createdBy.id, name: t.createdBy.name } : null,
        deletedAt: t.deletedAt,
        deletedBy: deleterByTask.get(t.id) ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Khôi phục các Task đã chọn. Chỉ tác động Task ĐANG xoá mềm (Task còn dùng
   * bị bỏ qua). Liên kết/checklist/khách hàng gắn kèm vốn KHÔNG bị xoá lúc
   * xoá mềm nên tự "sống lại" cùng Task.
   */
  async restore(ids: number[], adminId: number): Promise<{ restored: number; skipped: number }> {
    const uniqueIds = [...new Set(ids)];

    const trashed = await this.taskRepo.find({
      where: { id: In(uniqueIds), deletedAt: Not(IsNull()) },
      withDeleted: true,
      select: { id: true, title: true },
    });
    if (trashed.length === 0) {
      throw new NotFoundException('Không có Công việc nào trong thùng rác khớp danh sách đã chọn');
    }

    const result = await this.taskRepo
      .createQueryBuilder()
      .restore()
      .where('id IN (:...ids)', { ids: trashed.map((t) => t.id) })
      .andWhere('deleted_at IS NOT NULL')
      .execute();
    const restored = result.affected ?? trashed.length;

    for (const t of trashed) {
      this.periodicTaskAuditService.logActionAsync(t.id, adminId, PeriodicTaskAuditAction.RESTORED, null, {
        title: t.title,
      });
    }
    this.logger.log(`Admin #${adminId} restored ${restored} periodic task(s)`);

    return { restored, skipped: uniqueIds.length - trashed.length };
  }

  /** Xoá vĩnh viễn các Task đã chọn - Task CHƯA xoá mềm bị bỏ qua (không bao giờ xoá nhầm Task đang dùng). */
  async hardDelete(ids: number[], adminId: number): Promise<{ deleted: number; skipped: number }> {
    const uniqueIds = [...new Set(ids)];

    const trashed = await this.taskRepo.find({
      where: { id: In(uniqueIds), deletedAt: Not(IsNull()) },
      withDeleted: true,
      select: { id: true, title: true },
    });
    if (trashed.length === 0) {
      throw new NotFoundException('Không có Công việc nào trong thùng rác khớp danh sách đã chọn');
    }

    const result = await this.taskRepo
      .createQueryBuilder()
      .delete()
      .where('id IN (:...ids)', { ids: trashed.map((t) => t.id) })
      .andWhere('deleted_at IS NOT NULL') // chốt chặn lần 2
      .execute();
    const deleted = result.affected ?? trashed.length;

    await this.auditService.logAction(adminId, 'HARD_DELETE_PERIODIC_TASKS', 'periodic_task', 0, {
      count: deleted,
      tasks: trashed.map((t) => ({ id: t.id, title: t.title })),
    }, null);
    this.logger.log(`Admin #${adminId} hard-deleted ${deleted} periodic task(s)`);

    return { deleted, skipped: uniqueIds.length - trashed.length };
  }

  /** Dọn sạch thùng rác: xoá vĩnh viễn TOÀN BỘ Task đã xoá mềm. */
  async emptyTrash(adminId: number): Promise<{ deleted: number }> {
    const trashed = await this.taskRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
      select: { id: true, title: true },
    });
    if (trashed.length === 0) return { deleted: 0 };

    const result = await this.taskRepo.createQueryBuilder().delete().where('deleted_at IS NOT NULL').execute();
    const deleted = result.affected ?? trashed.length;

    await this.auditService.logAction(adminId, 'EMPTY_PERIODIC_TASK_TRASH', 'periodic_task', 0, {
      count: deleted,
      tasks: trashed.slice(0, 200).map((t) => ({ id: t.id, title: t.title })),
    }, null);
    this.logger.log(`Admin #${adminId} emptied periodic task trash (${deleted} task(s))`);

    return { deleted };
  }
}
