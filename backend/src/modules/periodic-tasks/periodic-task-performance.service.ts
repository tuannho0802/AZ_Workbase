import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { PeriodicTaskSecondaryAssigneesService } from './periodic-task-secondary-assignees.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { todayVnStr, toVnDateStr } from '../../common/utils/date-vn.util';
import { resolveListWindow, addDaysToDateString } from './helpers/list-window.helper';
import { rawDateToYmd } from './helpers/raw-date.helper';
import { PeriodicTaskAuditAction } from './periodic-task-audit.service';
import { PeriodicTaskPerformanceFiltersDto } from './dto/periodic-task-performance-filters.dto';
import { RequestingUser } from './periodic-tasks.service';

/** Số ngày ân hạn (grace period) SAU `period_end_date` - chốt nghiệp vụ mới
 * nhất của chủ dự án (2026-09-24, xem JSDoc `resolveReachedReviewOrDoneAt`
 * bên dưới): "trong 7 ngày tính từ ngày kỳ hạn mà chưa chuyển sang in_review
 * hoặc completed thì sau đó nếu chuyển trạng thái sẽ báo là trễ". THAY THẾ
 * HOÀN TOÀN quy tắc cũ so `completed_at > period_end_date` (xem bug thật ghi
 * chú bên dưới). */
export const LATE_GRACE_DAYS = 7;

/** Số Task tối đa / trang / nhóm ("Phụ trách chính"/"Phụ trách phụ") ở
 * `getUserTasks()` (yêu cầu chủ dự án 2026-09-25: phân trang THẬT ở BE, tránh
 * tải hết rồi cắt trang ở FE, để Drawer/view "own" không bị quá dài). */
export const USER_TASKS_PAGE_SIZE = 2;

/** 1 nhóm Task đã phân trang ("Phụ trách chính" HOẶC "Phụ trách phụ") -
 * `total` là TOÀN BỘ số Task khớp bộ lọc (không chỉ trang đang xem), để FE vẽ
 * `<Pagination>`. */
export interface PaginatedUserTasks {
  items: PeriodicTask[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PerformanceUserRow {
  userId: number;
  userName: string;
  /** Tổng Task trong kỳ, ĐÃ TRỪ status `is_excluded_from_rollup=true` (mirror PLAN mục 2.3 - rollup %). */
  total: number;
  /** Đã đạt in_review/done, trong vòng `period_end_date + LATE_GRACE_DAYS` (xem JSDoc class). */
  completedOnTime: number;
  /** Đã đạt in_review/done nhưng SAU `period_end_date + LATE_GRACE_DAYS`. */
  completedLate: number;
  /** CHƯA đạt in_review/done và hôm nay ĐÃ QUA khỏi `period_end_date + LATE_GRACE_DAYS`. */
  overdueNotCompleted: number;
  /** CHƯA đạt in_review/done nhưng vẫn còn trong (hoặc chưa tới) khoảng ân hạn - KHÔNG tính là "trễ/thiếu sót", chỉ để tham khảo. */
  pendingFuture: number;
  /** % (completedOnTime + completedLate) / total, làm tròn 1 số lẻ. `null` nếu total=0. */
  completionRatePercent: number | null;
  /** % completedLate / (completedOnTime + completedLate) - trong số ĐÃ xong, bao nhiêu % là xong trễ. `null` nếu chưa có task nào xong. */
  lateRatePercent: number | null;
  /** Số Task đang có `status.code = 'in_progress'` NGAY TẠI THỜI ĐIỂM XEM (trạng thái
   * HIỆN TẠI, không phải lịch sử) - YÊU CẦU chủ dự án 2026-09-25: thêm "% đang làm" bên
   * cạnh % hoàn thành/muộn đã có. KHÔNG loại trừ lẫn với `completedOnTime`/`completedLate`/
   * `overdueNotCompleted` (những field đó tính theo KẾT QUẢ hoàn thành đúng/trễ hạn, còn
   * đây chỉ là snapshot trạng thái hiện tại - 1 Task "Quá hạn chưa xong" vẫn có thể đang
   * `in_progress`, sẽ được đếm ở CẢ 2 chỗ, đúng ý nghĩa từng field). */
  inProgressCount: number;
  /** Số Task đang có `status.code = 'in_review'` hiện tại (mirror `inProgressCount`).
   * ⚠️ Khác `completedOnTime`/`completedLate`: 2 field đó tính theo MỐC đầu tiên đạt
   * in_review/done (có thể Task đã bị chuyển tiếp sang trạng thái khác SAU ĐÓ) - còn đây
   * là đang đứng Ở ĐÚNG cột `in_review` ngay lúc này. */
  inReviewCount: number;
  /** % inProgressCount / total. `null` nếu total=0. */
  inProgressRatePercent: number | null;
  /** % inReviewCount / total. `null` nếu total=0. */
  inReviewRatePercent: number | null;
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
 * ⚠️ BUG THẬT PHÁT HIỆN 2026-09-24 (báo cho chủ dự án, ngoài phạm vi câu hỏi
 * đang hỏi - đúng mục 8 Custom Instructions): cột `periodic_tasks.completed_at`
 * KHÔNG BAO GIỜ được set ở bất kỳ đâu trong `periodic-tasks.service.ts` (grep
 * toàn bộ module chỉ thấy nó ở SELECT của file NÀY) - bản implement TRƯỚC ĐÓ
 * của Phase này dựa vào `completed_at > period_end_date` để tính "hoàn thành
 * muộn" do đó LUÔN LUÔN trả `completedOnTime` cho mọi Task đã xong, không
 * bao giờ phát hiện được trễ thật. Bản implement NÀY bỏ hẳn `completed_at`,
 * thay bằng mốc lấy từ `periodic_task_audit_logs` (xem
 * `resolveReachedReviewOrDoneAt()`).
 *
 * ⚠️ "Hoàn thành (đúng hạn/muộn)" - CHỐT LẠI 2026-09-24 (thay thế hoàn toàn
 * quy tắc `completed_at` cũ): Task được coi là "đã xong" khi lần ĐẦU TIÊN nó
 * chuyển sang trạng thái có `code = 'in_review'` HOẶC `is_done_state = true`
 * (không hardcode riêng `code = 'completed'` - để đúng ý "in_review HOẶC
 * completed" của chủ dự án, đồng thời tương thích mọi status "hoàn thành"
 * khác Admin tự thêm sau này qua `is_done_state`). Mốc thời gian này lấy từ
 * `periodic_task_audit_logs` (action=`status_changed`, JSON `new_data.status.id`
 * đầu tiên khớp) - KHÔNG dùng `completed_at` (xem bug thật ở trên).
 *  - `completedOnTime`: mốc đó (lấy NGÀY, giờ VN) <= `period_end_date + 7
 *    ngày` (`LATE_GRACE_DAYS`, ân hạn chủ dự án chốt 2026-09-24 - cho phép
 *    User có vài ngày sau kỳ hạn để tick/chuyển review mà KHÔNG bị tính trễ).
 *  - `completedLate`: mốc đó > `period_end_date + 7 ngày`.
 *  - `overdueNotCompleted`: CHƯA từng đạt in_review/done VÀ hôm nay đã QUA
 *    khỏi `period_end_date + 7 ngày` (áp dụng ân hạn NHẤT QUÁN, không chỉ
 *    riêng lúc tính trễ - tránh 2 mốc "trễ" khác nhau cho cùng 1 khái niệm).
 *  - `pendingFuture`: CHƯA đạt in_review/done nhưng vẫn còn trong (hoặc chưa
 *    tới) khoảng ân hạn - KHÔNG trừ điểm (đúng yêu cầu chủ dự án: "Chừa lại
 *    các ngày tương lai vì hiện tại có thể User quên đánh dấu là hoàn
 *    thành").
 *  - Task tạo THẲNG với status đã qualify (in_review/done) ngay từ đầu, KHÔNG
 *    hề qua audit log `status_changed` nào (VD tạo qua API với `statusId`
 *    truyền sẵn) -> fallback dùng `task.createdAt` làm mốc (xem
 *    `resolveReachedReviewOrDoneAt`).
 *  - `in_review` là 1 `code` trong bảng động `periodic_task_statuses` (Admin
 *    tự CRUD, xem `SKILL_NESTJS_BACKEND.md`/entity JSDoc) - chủ dự án XÁC
 *    NHẬN đã tự thêm status này trên Production qua UI có sẵn, môi trường
 *    local CHƯA có row này -> CỐ TÌNH không kèm migration seed cho `in_review`
 *    ở đây, code chỉ so sánh theo `code` string, tự nhiên "vô hại" (không lỗi,
 *    chỉ không match được gì) nếu DB chưa có row đó.
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
 *
 * ⚠️ MỚI (2026-09-25, yêu cầu chủ dự án - KHÔNG cần migration vì `in_progress`
 * cũng là code Admin đã tự tạo sẵn trên Production, mirror đúng `in_review`):
 * thêm `inProgressCount`/`inReviewCount` (+ % tương ứng) = đếm Task đang có
 * `status.code` khớp NGAY TẠI THỜI ĐIỂM XEM (snapshot trạng thái hiện tại,
 * KHÔNG phải mốc lịch sử như `completedOnTime`/`completedLate` ở trên) - dùng
 * hiển thị thêm "% Đang làm"/"% Đang xem xét" ở bảng tổng hợp FE. Cả 2 field
 * này ĐỘC LẬP hoàn toàn với `completedOnTime`/`completedLate`/
 * `overdueNotCompleted`/`pendingFuture` (không cộng dồn vừa đủ = `total`) -
 * 1 Task có thể vừa `overdueNotCompleted` (theo mốc hoàn thành) vừa
 * `inProgressCount` (theo trạng thái hiện tại) cùng lúc, đúng bản chất 2 khái
 * niệm khác nhau.
 */
@Injectable()
export class PeriodicTaskPerformanceService {
  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    @InjectRepository(PeriodicTaskChecklistItem)
    private readonly checklistRepo: Repository<PeriodicTaskChecklistItem>,
    @InjectRepository(PeriodicTaskStatus)
    private readonly statusRepo: Repository<PeriodicTaskStatus>,
    @InjectRepository(PeriodicTaskAuditLog)
    private readonly auditLogRepo: Repository<PeriodicTaskAuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly permissionsService: PermissionsService,
    // MỚI (2026-09-25, `getUserTasks()`) - đính `secondaryAssignees` vào Task
    // trả về, để FE hiện được "Phụ trách phụ" trên `TaskMiniCard` (mirror
    // ĐÚNG cách `PeriodicTasksController` đính cho `GET /periodic-tasks`,
    // KHÔNG tự viết lại query join này lần 2).
    private readonly secondaryAssigneesService: PeriodicTaskSecondaryAssigneesService,
  ) {}

  /** `code = 'in_review'` (Admin tự thêm trên Production, xem JSDoc class)
   * HOẶC `is_done_state = true` (bao gồm `completed` seed sẵn + mọi status
   * "hoàn thành" khác Admin thêm sau này). */
  private async loadQualifyingStatusIds(): Promise<Set<number>> {
    const statuses = await this.statusRepo.find({ select: { id: true, code: true, isDoneState: true } });
    return new Set(statuses.filter((s) => s.code === 'in_review' || s.isDoneState).map((s) => s.id));
  }

  /**
   * Map<taskId, "YYYY-MM-DD"> = ngày (giờ VN) Task lần ĐẦU TIÊN đạt trạng
   * thái in_review/done, đọc từ `periodic_task_audit_logs` (action=
   * `status_changed`, sắp ASC theo `created_at`, giữ lần khớp SỚM NHẤT).
   * Task nào KHÔNG có key trong Map = CHƯA TỪNG đạt in_review/done.
   *
   * Fallback `task.createdAt`: Task tạo THẲNG với status đã qualify ngay từ
   * đầu (không hề có audit log `status_changed` nào vì statusId chưa từng
   * "đổi") - `currentStatusId`/`taskCreatedAtById` do caller truyền vào để
   * xử lý case này mà không cần query lại `periodic_tasks`.
   */
  private async resolveReachedReviewOrDoneAt(
    tasks: Array<{ taskId: number; currentStatusId: number; createdAt: Date }>,
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (tasks.length === 0) return result;

    const qualifyingIds = await this.loadQualifyingStatusIds();
    if (qualifyingIds.size === 0) return result;

    const taskIds = tasks.map((t) => t.taskId);
    const logs = await this.auditLogRepo.find({
      where: { taskId: In(taskIds), action: PeriodicTaskAuditAction.STATUS_CHANGED },
      select: { taskId: true, newData: true, createdAt: true },
      order: { createdAt: 'ASC' },
    });

    for (const log of logs) {
      if (result.has(log.taskId)) continue; // đã có mốc SỚM HƠN (order ASC) - giữ nguyên, không ghi đè
      const statusId = (log.newData as { status?: { id?: number } } | null)?.status?.id;
      if (statusId != null && qualifyingIds.has(statusId)) {
        result.set(log.taskId, toVnDateStr(log.createdAt));
      }
    }

    // Fallback: status hiện tại đã qualify nhưng KHÔNG tìm thấy audit log
    // nào khớp ở trên (tạo thẳng với statusId đó, chưa từng qua PATCH đổi
    // status) -> dùng createdAt của chính Task.
    for (const t of tasks) {
      if (!result.has(t.taskId) && qualifyingIds.has(t.currentStatusId)) {
        result.set(t.taskId, toVnDateStr(t.createdAt));
      }
    }

    return result;
  }

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

  /**
   * Scope filter DÀNH RIÊNG cho `getUserTasks()` (khác `applyScopeFilter()` ở
   * trên dùng cho `getSummary()`/`getUserFlaggedTasks()`): 2 hàm đó lọc theo
   * DANH TÍNH NGƯỜI XEM (viewer) - nhánh 'own' ép `primaryAssigneeId =
   * user.id` (đúng cho "tổng hợp hiệu suất của TÔI"), nhưng `getUserTasks()`
   * đã CHỐT SẴN `targetUserId` cụ thể (được `resolveScope()` + guard ở đầu
   * `getUserTasks()` xác nhận hợp lệ) và cần trả CẢ Task Phụ trách phụ (không
   * phải `primaryAssigneeId`) của đúng `targetUserId` đó - áp lại nhánh 'own'
   * của `applyScopeFilter()` ở đây sẽ xoá sạch nhầm danh sách Phụ trách phụ
   * (vì `primaryAssigneeId` của Task đó KHÁC `targetUserId`). Chỉ còn cần
   * chặn thêm 1 lớp cho scope='department': Manager chỉ xem được Task thuộc
   * phòng ban mình quản lý (mirror ĐÚNG nhánh `department` của
   * `applyScopeFilter()`) - chặn cả trường hợp Manager tự sửa `userId` trên
   * URL để dò xem Nhân viên phòng ban khác (Task của họ thuộc phòng ban khác
   * sẽ không khớp điều kiện này, trả về rỗng thay vì rò rỉ dữ liệu).
   */
  private applyDepartmentOnlyScopeFilter(
    qb: ReturnType<Repository<PeriodicTask>['createQueryBuilder']>,
    user: RequestingUser,
    scope: PermissionScope | 'own',
  ) {
    if (user.role === Role.ADMIN && user.isRootAdmin) return qb;
    if (scope !== PermissionScope.DEPARTMENT) return qb; // 'all': không giới hạn thêm. 'own': targetUserId đã tự giới hạn đủ.
    qb.andWhere(
      'task.department_id IN ' +
      '(SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :perfManagerId)',
      { perfManagerId: user.id },
    );
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
        'task.statusId AS status_id',
        'task.periodEndDate AS period_end_date',
        'task.createdAt AS created_at',
        'status.isExcludedFromRollup AS is_excluded_from_rollup',
        // MỚI (2026-09-25) - dùng đếm "% Đang làm (in_progress)" / "% Đang xem xét
        // (in_review)" ở getSummary(). Chỉ so theo `code` string (giống
        // loadQualifyingStatusIds()) - vô hại nếu DB chưa có status với code này.
        'status.code AS status_code',
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
      status_id: number;
      period_end_date: string | Date;
      created_at: string;
      is_excluded_from_rollup: 0 | 1;
      status_code: string | null;
    }> = await qb.getRawMany();

    const rollupRows = raw.filter((r) => Number(r.is_excluded_from_rollup) !== 1); // (PLAN mục 2.3)
    const reachedMap = await this.resolveReachedReviewOrDoneAt(
      rollupRows.map((r) => ({ taskId: r.task_id, currentStatusId: r.status_id, createdAt: new Date(r.created_at) })),
    );

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
          inProgressCount: 0,
          inReviewCount: 0,
          inProgressRatePercent: null,
          inReviewRatePercent: null,
          checklistDone: 0,
          checklistTotal: 0,
        };
        byUser.set(r.primary_assignee_id, row);
      }

      row.total += 1;
      // Snapshot trạng thái HIỆN TẠI (độc lập với completedOnTime/Late/overdue ở dưới -
      // xem JSDoc field `inProgressCount`/`inReviewCount`).
      if (r.status_code === 'in_progress') row.inProgressCount += 1;
      else if (r.status_code === 'in_review') row.inReviewCount += 1;

      const periodEndDate = rawDateToYmd(r.period_end_date);
      const graceDate = addDaysToDateString(periodEndDate, LATE_GRACE_DAYS);
      const reachedDate = reachedMap.get(r.task_id) ?? null;

      if (reachedDate) {
        if (reachedDate > graceDate) {
          row.completedLate += 1;
        } else {
          row.completedOnTime += 1;
        }
      } else if (today > graceDate) {
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
        row.inProgressRatePercent = row.total > 0 ? Math.round((row.inProgressCount / row.total) * 1000) / 10 : null;
        row.inReviewRatePercent = row.total > 0 ? Math.round((row.inReviewCount / row.total) * 1000) / 10 : null;
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
      status_id: number;
      period_end_date: string | Date;
      created_at: string;
      is_excluded_from_rollup: 0 | 1;
    }>();

    const rollupRows = raw.filter((r) => Number(r.is_excluded_from_rollup) !== 1);
    const reachedMap = await this.resolveReachedReviewOrDoneAt(
      rollupRows.map((r) => ({ taskId: r.task_id, currentStatusId: r.status_id, createdAt: new Date(r.created_at) })),
    );

    const flaggedTaskIds = rollupRows
      .filter((r) => {
        const periodEndDate = rawDateToYmd(r.period_end_date);
        const graceDate = addDaysToDateString(periodEndDate, LATE_GRACE_DAYS);
        const reachedDate = reachedMap.get(r.task_id) ?? null;
        if (reachedDate) return reachedDate > graceDate; // hoàn thành muộn (sau ân hạn)
        return today > graceDate; // quá hạn chưa xong (đã qua cả ân hạn)
      })
      .map((r) => r.task_id);

    if (flaggedTaskIds.length === 0) return [];

    return this.taskRepo.find({
      where: { id: In(flaggedTaskIds) },
      relations: ['status', 'primaryAssignee', 'department'],
      order: { periodEndDate: 'DESC' },
    });
  }

  /**
   * getUserTasks - MỚI (2026-09-25, yêu cầu chủ dự án): danh sách ĐẦY ĐỦ Task
   * của 1 User trong khoảng lọc, KHÔNG giới hạn "hoàn thành muộn/quá hạn" như
   * `getUserFlaggedTasks()` (mục đích khác nhau - hàm đó phục vụ nút "Chi
   * tiết" chỉ bật khi có Task cần lưu ý, hàm NÀY phục vụ:
   *  1) Trang "Hiệu suất công việc" khi scope resolve ra 'own' (permission
   *     tắt hoặc bật nhưng scope='own') - hiển thị TOÀN BỘ Task của chính
   *     mình dạng Card chi tiết (mirror `PeriodicTasksAgendaView`), không chỉ
   *     1 dòng số liệu tổng như bảng hiện tại.
   *  2) Drawer "Chi tiết" cho User khác khi scope='department'/'all' - CHO
   *     PHÉP xem bất kỳ lúc nào (không cần điều kiện "có Task cần lưu ý" như
   *     trước), để User role cao hơn (Admin/Manager) rà soát được toàn bộ
   *     công việc của Nhân viên mình quản lý.
   *
   * Trả 2 nhóm TÁCH RIÊNG (không gộp 1 mảng kèm cờ) vì FE cần hiển thị 2 khối
   * khác nhau ("Phụ trách chính" luôn hiện trước, "Phụ trách phụ" ở dưới -
   * yêu cầu chủ dự án) - tách sẵn ở BE để FE khỏi tự lọc lại.
   *
   * PHÂN TRANG SERVER-SIDE (MỚI 2026-09-25, yêu cầu chủ dự án): mỗi nhóm tối
   * đa `USER_TASKS_PAGE_SIZE` (= 2) Task/trang, `primaryPage`/`secondaryPage`
   * ĐỘC LẬP nhau (FE có thể lật trang nhóm "Phụ trách phụ" mà không ảnh hưởng
   * trang đang xem của nhóm "Phụ trách chính") - dùng `skip`/`take` +
   * `getManyAndCount()` (KHÔNG `getMany()` rồi `.slice()` ở FE) để tránh tải
   * dư dữ liệu khi 1 User có hàng trăm Task trong khoảng lọc.
   *
   * SẮP XẾP (MỚI 2026-09-25, yêu cầu chủ dự án): Task có `periodEndDate`
   * GẦN ngày hôm nay nhất (giờ VN, `todayVnStr()`) hiển thị TRƯỚC - dùng
   * `ABS(DATEDIFF(period_end_date, :today))` ASC thay vì `periodEndDate` DESC/
   * ASC đơn thuần, vì cả Task "sắp tới" (tương lai gần) lẫn Task "vừa qua hạn"
   * (quá khứ gần) đều cần ưu tiên hiện trước Task ở xa cả 2 hướng thời gian.
   * `periodEndDate DESC` làm tiêu chí phụ (tie-break) khi khoảng cách bằng
   * nhau (vd Task hôm qua vs Task ngày mai, cùng cách 1 ngày - ưu tiên Task
   * gần đây hơn/mới hơn lên trước).
   *
   * Quyền xem = ĐÚNG `resolveScope()` (permission `periodic_tasks.performance_view`)
   * y hệt `getSummary()`/`getUserFlaggedTasks()`, KHÔNG tạo permission mới -
   * xem Task đầy đủ của 1 User vẫn là 1 dạng "xem hiệu suất/công việc của
   * User đó", đúng phạm vi permission đã có.
   */
  async getUserTasks(
    targetUserId: number,
    filters: PeriodicTaskPerformanceFiltersDto,
    user: RequestingUser,
  ): Promise<{ scope: PermissionScope | 'own'; primary: PaginatedUserTasks; secondary: PaginatedUserTasks }> {
    const scope = await this.resolveScope(user);
    if (scope === PermissionScope.OWN && targetUserId !== user.id) {
      throw new ForbiddenException('Bạn chỉ được xem công việc của chính mình.');
    }

    const dateWindow = resolveListWindow({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
    const today = todayVnStr();
    const primaryPage = Math.max(1, filters.primaryPage ?? 1);
    const secondaryPage = Math.max(1, filters.secondaryPage ?? 1);

    const applyCommon = (qb: ReturnType<Repository<PeriodicTask>['createQueryBuilder']>) => {
      qb.where('task.deletedAt IS NULL');
      if (filters.periodType) qb.andWhere('task.periodType = :perfPeriodType', { perfPeriodType: filters.periodType });
      if (dateWindow.dateFrom) qb.andWhere('task.periodEndDate >= :perfDateFrom', { perfDateFrom: dateWindow.dateFrom });
      if (dateWindow.dateTo) qb.andWhere('task.periodStartDate <= :perfDateTo', { perfDateTo: dateWindow.dateTo });
      if (filters.departmentId) qb.andWhere('task.departmentId = :perfDepartmentId', { perfDepartmentId: filters.departmentId });
      this.applyDepartmentOnlyScopeFilter(qb, user, scope);
      return (
        qb
          .leftJoinAndSelect('task.status', 'status')
          .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
          .leftJoinAndSelect('task.department', 'department')
          // BUG THẬT đã gặp (2026-09-25, lỗi 500 thật trên môi trường dev):
          // `.orderBy('ABS(DATEDIFF(task.period_end_date, :perfToday))', 'ASC')`
          // ném `TypeORMError: "ABS(DATEDIFF(task" alias was not found` khi
          // query có CẢ join (`leftJoinAndSelect`) LẪN `skip()/take()` - TypeORM
          // (`SelectQueryBuilder.executeEntitiesAndRawResults()`) bật nhánh
          // "distinct pagination" bất cứ khi nào `(skip || take) && joinAttributes.length > 0`
          // (đúng trường hợp của mình, VÌ có 3 `leftJoinAndSelect` ở trên), và
          // nhánh đó gọi `createOrderByCombinedWithSelectExpression()` - hàm
          // này parse MỌI chuỗi `orderBy` bằng cách SPLIT theo dấu `.` đầu
          // tiên rồi coi phần trước là 1 alias JOIN đã khai báo (`alias.column`)
          // - với raw expression như trên, nó cắt nhầm `"ABS(DATEDIFF(task"`
          // làm alias (do gặp dấu `.` trong `task.period_end_date`) rồi tra
          // `findAliasByName()` không thấy -> throw. KHÔNG liên quan MySQL
          // thật hay không - đã tái hiện lại 100% lỗi này OFFLINE bằng
          // `better-sqlite3` in-memory (join + skip/take + raw orderBy chứa
          // dấu `.`), không cần kết nối DB thật của dự án.
          //
          // FIX: đưa biểu thức raw vào `addSelect(..., alias)` (không chứa
          // dấu `.`) rồi `orderBy(alias)` - alias đơn (không có `.`) đi thẳng
          // vào nhánh `else` của hàm trên (so khớp theo tên select đã thêm),
          // không bị parse nhầm thành `alias.column` nữa. Đã verify lại bằng
          // repro tương tự (join + skip/take) - chạy đúng, không lỗi.
          .addSelect('ABS(DATEDIFF(task.period_end_date, :perfToday))', 'date_diff_order')
          .orderBy('date_diff_order', 'ASC')
          // Xem JSDoc "SẮP XẾP" ở trên - gần ngày hôm nay nhất lên đầu, tie-break bằng periodEndDate DESC.
          .addOrderBy('task.periodEndDate', 'DESC')
          .setParameter('perfToday', today)
      );
    };

    const primaryQb = applyCommon(this.taskRepo.createQueryBuilder('task'))
      .andWhere('task.primaryAssigneeId = :perfTargetUserId', { perfTargetUserId: targetUserId })
      .skip((primaryPage - 1) * USER_TASKS_PAGE_SIZE)
      .take(USER_TASKS_PAGE_SIZE);

    const secondaryQb = applyCommon(this.taskRepo.createQueryBuilder('task'))
      .andWhere('task.id IN (SELECT psa.task_id FROM periodic_task_secondary_assignees psa WHERE psa.user_id = :perfSecTargetUserId)', {
        perfSecTargetUserId: targetUserId,
      })
      .skip((secondaryPage - 1) * USER_TASKS_PAGE_SIZE)
      .take(USER_TASKS_PAGE_SIZE);

    const [[primaryTasksRaw, primaryTotal], [secondaryTasksRaw, secondaryTotal]] = await Promise.all([
      primaryQb.getManyAndCount(),
      secondaryQb.getManyAndCount(),
    ]);
    const [primaryTasks, secondaryTasks] = await Promise.all([
      this.secondaryAssigneesService.attachSecondaryAssigneesToList(primaryTasksRaw),
      this.secondaryAssigneesService.attachSecondaryAssigneesToList(secondaryTasksRaw),
    ]);

    return {
      scope,
      primary: { items: primaryTasks as PeriodicTask[], total: primaryTotal, page: primaryPage, pageSize: USER_TASKS_PAGE_SIZE },
      secondary: { items: secondaryTasks as PeriodicTask[], total: secondaryTotal, page: secondaryPage, pageSize: USER_TASKS_PAGE_SIZE },
    };
  }
}