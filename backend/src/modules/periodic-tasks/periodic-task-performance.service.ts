import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { User } from '../../database/entities/user.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { resolveListWindow } from './helpers/list-window.helper';
import { PeriodicTaskPerformanceFiltersDto } from './dto/periodic-task-performance-filters.dto';
import { RequestingUser } from './periodic-tasks.service';

export interface PerformanceUserRow {
  userId: number;
  userName: string;
  /** Tổng Task trong kỳ, ĐÃ TRỪ status `is_excluded_from_rollup=true` (mirror PLAN mục 2.3 - rollup %). */
  total: number;
  /** Đã hoàn thành ĐÚNG hạn (completed_at NULL hoặc completed_at <= period_end_date). */
  completedOnTime: number;
  /** Đã hoàn thành nhưng TRỄ (completed_at > period_end_date - xem PLAN yêu cầu "hoàn thành muộn"). */
  completedLate: number;
  /** CHƯA hoàn thành và ĐÃ quá `period_end_date` (today > period_end_date). */
  overdueNotCompleted: number;
  /** CHƯA hoàn thành nhưng CHƯA tới hạn (period_end_date >= today) - KHÔNG tính là "trễ/thiếu sót", chỉ để tham khảo. */
  pendingFuture: number;
  /** % (completedOnTime + completedLate) / total, làm tròn 1 số lẻ. `null` nếu total=0. */
  completionRatePercent: number | null;
  /** % completedLate / (completedOnTime + completedLate) - trong số ĐÃ xong, bao nhiêu % là xong trễ. `null` nếu chưa có task nào xong. */
  lateRatePercent: number | null;
  checklistDone: number;
  checklistTotal: number;
}

export interface PerformanceSummaryResult {
  scope: PermissionScope | 'own';
  dateFrom: string;
  dateTo: string;
  rows: PerformanceUserRow[];
}

/**
 * PeriodicTaskPerformanceService - "Hiệu suất công việc" (thống kê % hoàn
 * thành / hoàn thành muộn theo User của module Công việc định kỳ).
 *
 * ⚠️ Đơn vị đo hiệu suất = NGƯỜI PHỤ TRÁCH CHÍNH (`primary_assignee_id`) của
 * Task, KHÔNG gộp Phụ trách phụ vào - giả định này CẦN xác nhận lại với chủ
 * dự án nếu muốn tính cả hiệu suất của Phụ trách phụ (hiện tại "hiệu suất"
 * đang hiểu là "người CHỊU TRÁCH NHIỆM chính", mirror nghĩa `primaryAssigneeId`
 * ở mọi nơi khác trong module này).
 *
 * ⚠️ "Hoàn thành muộn" = `status.is_done_state=true` VÀ `completed_at` (lấy
 * phần NGÀY, giờ VN) > `period_end_date`. "Chưa hoàn thành" chỉ bị tính là
 * THIẾU SÓT (`overdueNotCompleted`) khi `period_end_date` đã QUA - Task chưa
 * tới hạn được xếp riêng vào `pendingFuture`, KHÔNG trừ điểm (đúng yêu cầu
 * chủ dự án: "Chừa lại các ngày tương lai vì hiện tại có thể User quên đánh
 * dấu là hoàn thành").
 *
 * Phạm vi xem (scope) KHÔNG dùng `PeriodicTaskAccessHelper` (đo theo
 * `createdBy`/Phụ trách chính+phụ của NGƯỜI XEM) mà tự định nghĩa lại theo
 * `task.departmentId` (mirror nhánh `department` của helper đó) vì đối tượng
 * đang lọc là "User khác", không phải "Task của tôi":
 *  - `own` (mặc định khi KHÔNG có permission `periodic_tasks.performance_view`
 *    - xem migration seed): chỉ tính Task có `primary_assignee_id` = chính
 *    mình.
 *  - `department`: Task có `department_id` thuộc phòng ban mình quản lý
 *    (`department_managers`, mirror `PeriodicTaskAccessHelper`).
 *  - `all`: toàn bộ.
 */
@Injectable()
export class PeriodicTaskPerformanceService {
  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    @InjectRepository(PeriodicTaskChecklistItem)
    private readonly checklistRepo: Repository<PeriodicTaskChecklistItem>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Quyền "View bật/tắt" ĐÚNG NGHĨA ĐEN (xem JSDoc migration seed): KHÔNG
   * BAO GIỜ ném `ForbiddenException` ở đây (khác `PermissionGuard` bình
   * thường) - thiếu permission chỉ hạ xuống `own`, không chặn hẳn, vì xem
   * hiệu suất CỦA CHÍNH MÌNH luôn được phép.
   */
  async resolveScope(user: RequestingUser): Promise<PermissionScope | 'own'> {
    if (user.role === Role.ADMIN && user.isRootAdmin) return PermissionScope.ALL;

    const { allowed, scope } = await this.permissionsService.hasPermission(
      user.role,
      'periodic_tasks.performance_view',
      user.departmentId,
      user.positionId,
    );
    if (!allowed || !scope) return PermissionScope.OWN;
    return scope;
  }

  private applyScopeFilter(
    qb: ReturnType<Repository<PeriodicTask>['createQueryBuilder']>,
    user: RequestingUser,
    scope: PermissionScope | 'own',
  ) {
    if (user.role === Role.ADMIN && user.isRootAdmin) return qb;
    if (scope === PermissionScope.ALL) return qb;

    if (scope === PermissionScope.DEPARTMENT) {
      qb.andWhere(
        'task.department_id IN ' +
          '(SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :perfManagerId)',
        { perfManagerId: user.id },
      );
      return qb;
    }

    // 'own' (mặc định khi tắt permission, hoặc scope='own' thật sự).
    qb.andWhere('task.primaryAssigneeId = :perfOwnUserId', { perfOwnUserId: user.id });
    return qb;
  }

  private buildFilteredTaskQuery(filters: PeriodicTaskPerformanceFiltersDto, user: RequestingUser, scope: PermissionScope | 'own') {
    const dateWindow = resolveListWindow({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoin('task.status', 'status')
      .select([
        'task.id AS task_id',
        'task.primaryAssigneeId AS primary_assignee_id',
        'task.periodEndDate AS period_end_date',
        'task.completedAt AS completed_at',
        'status.isDoneState AS is_done_state',
        'status.isExcludedFromRollup AS is_excluded_from_rollup',
      ])
      .where('task.deletedAt IS NULL');

    this.applyScopeFilter(qb, user, scope);

    if (filters.periodType) {
      qb.andWhere('task.periodType = :perfPeriodType', { perfPeriodType: filters.periodType });
    }
    if (dateWindow.dateFrom) {
      qb.andWhere('task.periodEndDate >= :perfDateFrom', { perfDateFrom: dateWindow.dateFrom });
    }
    if (dateWindow.dateTo) {
      qb.andWhere('task.periodStartDate <= :perfDateTo', { perfDateTo: dateWindow.dateTo });
    }
    if (filters.departmentId) {
      qb.andWhere('task.departmentId = :perfDepartmentId', { perfDepartmentId: filters.departmentId });
    }

    return { qb, dateWindow };
  }

  async getSummary(filters: PeriodicTaskPerformanceFiltersDto, user: RequestingUser): Promise<PerformanceSummaryResult> {
    const scope = await this.resolveScope(user);

    if (filters.userId && scope === PermissionScope.OWN && filters.userId !== user.id) {
      throw new ForbiddenException('Bạn chỉ được xem hiệu suất của chính mình.');
    }

    const { qb, dateWindow } = this.buildFilteredTaskQuery(filters, user, scope);
    if (filters.userId) {
      qb.andWhere('task.primaryAssigneeId = :perfFilterUserId', { perfFilterUserId: filters.userId });
    }

    const today = todayVnStr();
    const raw: Array<{
      task_id: number;
      primary_assignee_id: number;
      period_end_date: string;
      completed_at: string | null;
      is_done_state: 0 | 1;
      is_excluded_from_rollup: 0 | 1;
    }> = await qb.getRawMany();

    const byUser = new Map<number, PerformanceUserRow>();
    const taskIdToUser = new Map<number, number>();

    for (const r of raw) {
      taskIdToUser.set(r.task_id, r.primary_assignee_id);
      if (Number(r.is_excluded_from_rollup) === 1) continue; // loại khỏi cả tử số lẫn mẫu số (PLAN mục 2.3)

      let row = byUser.get(r.primary_assignee_id);
      if (!row) {
        row = {
          userId: r.primary_assignee_id,
          userName: '',
          total: 0,
          completedOnTime: 0,
          completedLate: 0,
          overdueNotCompleted: 0,
          pendingFuture: 0,
          completionRatePercent: null,
          lateRatePercent: null,
          checklistDone: 0,
          checklistTotal: 0,
        };
        byUser.set(r.primary_assignee_id, row);
      }

      row.total += 1;
      const isDone = Number(r.is_done_state) === 1;
      const periodEndDate = String(r.period_end_date).slice(0, 10);

      if (isDone) {
        const completedDate = r.completed_at ? String(r.completed_at).slice(0, 10) : null;
        if (completedDate && completedDate > periodEndDate) {
          row.completedLate += 1;
        } else {
          row.completedOnTime += 1;
        }
      } else if (periodEndDate < today) {
        row.overdueNotCompleted += 1;
      } else {
        row.pendingFuture += 1;
      }
    }

    // Checklist: gom theo `primaryAssigneeId` của CHÍNH Task đó (mirror cách
    // `attachChecklistProgressToList()` tính {done,total} cho 1 Task, ở đây
    // cộng dồn thêm 1 tầng theo User).
    const taskIds = [...taskIdToUser.keys()];
    if (taskIds.length > 0) {
      const checklistRows = await this.checklistRepo
        .createQueryBuilder('item')
        .select('item.taskId', 'task_id')
        .addSelect('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN item.isDone = TRUE THEN 1 ELSE 0 END)', 'done')
        .where('item.taskId IN (:...taskIds)', { taskIds })
        .groupBy('item.taskId')
        .getRawMany<{ task_id: number; total: string; done: string }>();

      for (const c of checklistRows) {
        const assigneeId = taskIdToUser.get(c.task_id);
        if (assigneeId == null) continue;
        const row = byUser.get(assigneeId);
        if (!row) continue; // Task bị loại rollup ở trên vẫn có thể có checklist - cố tình bỏ qua, khớp đúng phạm vi rollup.
        row.checklistTotal += Number(c.total);
        row.checklistDone += Number(c.done);
      }
    }

    const userIds = [...byUser.keys()];
    if (userIds.length > 0) {
      const users = await this.userRepo.find({ where: { id: In(userIds) }, select: { id: true, name: true } });
      const nameById = new Map(users.map((u) => [u.id, u.name]));
      for (const row of byUser.values()) {
        row.userName = nameById.get(row.userId) ?? `#${row.userId}`;
        const completedTotal = row.completedOnTime + row.completedLate;
        row.completionRatePercent = row.total > 0 ? Math.round((completedTotal / row.total) * 1000) / 10 : null;
        row.lateRatePercent = completedTotal > 0 ? Math.round((row.completedLate / completedTotal) * 1000) / 10 : null;
      }
    }

    return {
      scope,
      dateFrom: dateWindow.dateFrom ?? filters.dateFrom ?? today,
      dateTo: dateWindow.dateTo ?? filters.dateTo ?? today,
      rows: [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName)),
    };
  }

  /**
   * Danh sách Task "hoàn thành muộn" hoặc "quá hạn chưa xong" của 1 User -
   * dùng cho FE drill-down từ 1 dòng ở bảng tổng hợp `getSummary()`. Cùng
   * điều kiện scope/permission như `getSummary()`.
   */
  async getUserFlaggedTasks(targetUserId: number, filters: PeriodicTaskPerformanceFiltersDto, user: RequestingUser) {
    const scope = await this.resolveScope(user);
    if (scope === PermissionScope.OWN && targetUserId !== user.id) {
      throw new ForbiddenException('Bạn chỉ được xem hiệu suất của chính mình.');
    }

    const today = todayVnStr();
    const { qb } = this.buildFilteredTaskQuery(filters, user, scope);
    qb.andWhere('task.primaryAssigneeId = :perfTargetUserId', { perfTargetUserId: targetUserId });

    const raw = await qb.getRawMany<{
      task_id: number;
      period_end_date: string;
      completed_at: string | null;
      is_done_state: 0 | 1;
      is_excluded_from_rollup: 0 | 1;
    }>();

    const flaggedTaskIds = raw
      .filter((r) => Number(r.is_excluded_from_rollup) !== 1)
      .filter((r) => {
        const periodEndDate = String(r.period_end_date).slice(0, 10);
        const isDone = Number(r.is_done_state) === 1;
        if (isDone) {
          const completedDate = r.completed_at ? String(r.completed_at).slice(0, 10) : null;
          return !!completedDate && completedDate > periodEndDate; // hoàn thành muộn
        }
        return periodEndDate < today; // quá hạn chưa xong
      })
      .map((r) => r.task_id);

    if (flaggedTaskIds.length === 0) return [];

    return this.taskRepo.find({
      where: { id: In(flaggedTaskIds) },
      relations: ['status', 'primaryAssignee', 'department'],
      order: { periodEndDate: 'DESC' },
    });
  }
}
