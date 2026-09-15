import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { User } from '../../database/entities/user.entity';
import { PeriodicTasksService, RequestingUser } from './periodic-tasks.service';
import { AddPeriodicTaskSecondaryAssigneeDto } from './dto/add-periodic-task-secondary-assignee.dto';

/**
 * PeriodicTaskSecondaryAssigneesService - Phase 4 (PLAN mục 6): "1 chính +
 * N phụ" cho Công việc định kỳ, mirror `LinkGroupSecondaryManager` về độ
 * đơn giản (bảng join thuần, KHÔNG giữ lịch sử) - xem PLAN mục 2.5.
 *
 * Khác `PeriodicTaskCustomersService` (Phase 3) ở chỗ CHỈ CẦN 1 lớp quyền -
 * `periodic_tasks.edit` (đã gate ở Controller/`PermissionGuard`, đúng mục 5)
 * - KHÔNG có permission nhị phân riêng như `link_customer`, và danh sách
 * phụ trách phụ KHÔNG cần ẩn field theo quyền `customers.view` (đây là
 * thông tin phân công nội bộ, không phải dữ liệu Customer nhạy cảm).
 */
@Injectable()
export class PeriodicTaskSecondaryAssigneesService {
  constructor(
    @InjectRepository(PeriodicTaskSecondaryAssignee)
    private readonly secondaryRepo: Repository<PeriodicTaskSecondaryAssignee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tasksService: PeriodicTasksService,
  ) {}

  /**
   * Danh sách User đang là phụ trách phụ của 1 Task - dùng lại cho cả
   * response của `addSecondaryAssignee()` và `attachSecondaryAssignees()`.
   */
  private async queryAssigneeUsers(taskId: number): Promise<User[]> {
    const rows = await this.secondaryRepo.find({
      where: { taskId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    return rows.filter((r) => r.user).map((r) => r.user);
  }

  /**
   * Thêm 1 phụ trách phụ vào Task (PLAN mục 2.5, endpoint mục 5).
   * `taskScope` = scope của `periodic_tasks.edit` (đã tính sẵn ở
   * `PermissionGuard`/Controller cho route này) - dùng để "1 cổng gác" qua
   * `tasksService.findOne()` trước, đúng nguyên tắc chung của module.
   */
  async addSecondaryAssignee(
    taskId: number,
    dto: AddPeriodicTaskSecondaryAssigneeDto,
    user: RequestingUser,
    taskScope?: string | null,
  ): Promise<User[]> {
    // 1 cổng gác - Task ngoài phạm vi periodic_tasks.edit của người gọi tự 404.
    const task = await this.tasksService.findOne(taskId, user.id, user.role, taskScope);
    // Phase 5: Task đang khoá mà thiếu `periodic_tasks.edit_locked` -> 403.
    await this.tasksService.assertEditableWhenLocked(task, user);

    // "Chính khác phụ" (spec bắt buộc PLAN mục 6) - không cho gán cùng 1
    // người vừa là chính (cột `primary_assignee_id` trên Task) vừa là phụ.
    if (task.primaryAssigneeId === dto.userId) {
      throw new BadRequestException(
        'Người này đang là Phụ trách chính của Công việc - không thể vừa là chính vừa là phụ',
      );
    }

    const targetUser = await this.userRepo.findOne({ where: { id: dto.userId, isActive: true } });
    if (!targetUser) {
      throw new BadRequestException(`Nhân viên ID ${dto.userId} không tồn tại hoặc đã bị khóa`);
    }

    const alreadySecondary = await this.secondaryRepo.findOne({
      where: { taskId, userId: dto.userId },
    });
    if (alreadySecondary) {
      throw new ConflictException('Người này đã là Phụ trách phụ của Công việc rồi');
    }

    const created = this.secondaryRepo.create({
      taskId,
      userId: dto.userId,
      addedById: user.id,
    });
    await this.secondaryRepo.save(created);

    return this.queryAssigneeUsers(taskId);
  }

  /** Gỡ 1 phụ trách phụ khỏi Task - cùng lớp quyền như `addSecondaryAssignee()`. */
  async removeSecondaryAssignee(
    taskId: number,
    targetUserId: number,
    user: RequestingUser,
    taskScope?: string | null,
  ): Promise<{ deleted: true }> {
    const task = await this.tasksService.findOne(taskId, user.id, user.role, taskScope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const existing = await this.secondaryRepo.findOne({ where: { taskId, userId: targetUserId } });
    if (!existing) {
      throw new NotFoundException('Người này không phải Phụ trách phụ của Công việc - không có gì để gỡ');
    }

    await this.secondaryRepo.remove(existing);
    return { deleted: true };
  }

  /**
   * Đính field `secondaryAssignees` vào response 1 Task (dùng ở
   * `PeriodicTasksController.findOne()`) - KHÔNG cần ẩn theo quyền (khác
   * `attachLinkedCustomers()` của Phase 3), vì đây là thông tin phân công
   * nội bộ, ai xem được Task thì xem được luôn danh sách phụ trách phụ.
   */
  async attachSecondaryAssignees<T extends object>(
    task: T,
  ): Promise<T & { secondaryAssignees: User[] }> {
    const taskId = (task as unknown as { id: number }).id;
    const secondaryAssignees = await this.queryAssigneeUsers(taskId);
    return { ...task, secondaryAssignees };
  }
}