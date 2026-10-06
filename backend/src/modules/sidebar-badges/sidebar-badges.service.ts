import { Injectable, Logger } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { CustomersService } from '../customers/customers.service';
import { UsersService } from '../users/users.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { PeriodicTasksService } from '../periodic-tasks/periodic-tasks.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';

/**
 * Số đếm cho badge sidebar - MỖI field CHỈ có mặt khi người gọi có permission
 * tương ứng (thiếu quyền -> field vắng mặt, FE không hiện badge) hoặc khi lần
 * đếm đó lỗi (lỗi 1 badge không làm hỏng các badge khác - giống khi mỗi badge
 * là 1 request riêng như trước).
 *
 * Badge "Thông báo" KHÔNG nằm ở đây: nó dùng chung `/notifications/poll` với
 * chuông thông báo ở Header (cần thêm `version` để bật toast).
 */
export interface SidebarBadges {
  invalidData?: number;
  trash?: number;
  pendingUsers?: number;
  leaveApprovals?: number;
  myPendingLeave?: number;
  taskTodo?: number;
  taskInProgress?: number;
}

export interface SidebarBadgeUser {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

/** Cache ngắn CHỈ cho số đếm trùng SĐT (query tổng hợp cả bảng khách - đắt nhất). */
export const INVALID_DATA_CACHE_TTL_MS = 180_000;
const INVALID_DATA_CACHE_MAX_ENTRIES = 200;

@Injectable()
export class SidebarBadgesService {
  private readonly logger = new Logger(SidebarBadgesService.name);
  // Cache theo TỪNG INSTANCE serverless (giống PermissionsService) - mất khi cold start, không sao.
  private readonly invalidDataCache = new Map<string, { value: number; expiresAt: number }>();

  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly customersService: CustomersService,
    private readonly usersService: UsersService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly periodicTasksService: PeriodicTasksService,
  ) {}

  /**
   * ⚠️ Bypass Root Admin ĐẶT TRƯỚC truy vấn DB - mirror ĐÚNG `PermissionGuard`
   * (role=admin VÀ isRootAdmin=true mới có mọi permission với scope=all).
   */
  private async resolve(user: SidebarBadgeUser, key: string) {
    if (user.role === Role.ADMIN && user.isRootAdmin) {
      return { allowed: true, scope: PermissionScope.ALL as PermissionScope | null };
    }
    return this.permissionsService.hasPermission(user.role, key, user.departmentId, user.positionId);
  }

  private async safe<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Badge "${label}" lỗi: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private async cachedInvalidData(user: SidebarBadgeUser, scope: string | null): Promise<number> {
    const key = `${user.id}:${user.role}:${scope ?? 'null'}`;
    const now = Date.now();
    const hit = this.invalidDataCache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = await this.customersService.countDuplicatePhoneRecords(user.id, user.role, scope);

    if (this.invalidDataCache.size >= INVALID_DATA_CACHE_MAX_ENTRIES) {
      this.invalidDataCache.clear(); // chặn phình bộ nhớ - bounded theo số user, rất hiếm khi chạm
    }
    this.invalidDataCache.set(key, { value, expiresAt: now + INVALID_DATA_CACHE_TTL_MS });
    return value;
  }

  async getBadges(user: SidebarBadgeUser): Promise<SidebarBadges> {
    const [invalid, trash, usersManage, leaveApprove, leaveRequest, taskView] = await Promise.all([
      this.resolve(user, 'customers.invalid_report'),
      this.resolve(user, 'customers.trash_manage'),
      this.resolve(user, 'users.manage'),
      this.resolve(user, 'leave_requests.approve'),
      this.resolve(user, 'leave_requests.request'),
      this.resolve(user, 'periodic_tasks.view'),
    ]);

    const out: SidebarBadges = {};
    const jobs: Promise<void>[] = [];
    const run = <T,>(label: string, fn: () => Promise<T>, assign: (v: T) => void) =>
      jobs.push(
        this.safe(label, fn).then((v) => {
          if (v !== undefined) assign(v);
        }),
      );

    if (invalid.allowed) {
      run('invalidData', () => this.cachedInvalidData(user, invalid.scope), (v) => (out.invalidData = v));
    }
    if (trash.allowed) {
      run('trash', () => this.customersService.countTrash(), (v) => (out.trash = v));
    }
    if (usersManage.allowed) {
      run(
        'pendingUsers',
        () => this.usersService.countPendingApprovals(user.id, user.role, usersManage.scope),
        (v) => (out.pendingUsers = v),
      );
    }
    if (leaveApprove.allowed) {
      run(
        'leaveApprovals',
        () => this.leaveRequestsService.countPending(user.id, user.role, leaveApprove.scope),
        (v) => (out.leaveApprovals = v.count),
      );
    }
    if (leaveRequest.allowed) {
      run('myPendingLeave', () => this.leaveRequestsService.countMyPending(user.id), (v) => (out.myPendingLeave = v.count));
    }
    if (taskView.allowed) {
      run(
        'tasks',
        () =>
          this.periodicTasksService.countAssignedByStatusCodes(
            user.id,
            ['not_started', 'in_progress'],
            user.id,
            user.role,
            taskView.scope,
          ),
        (v) => {
          out.taskTodo = v['not_started'] ?? 0;
          out.taskInProgress = v['in_progress'] ?? 0;
        },
      );
    }

    await Promise.all(jobs);
    return out;
  }
}
