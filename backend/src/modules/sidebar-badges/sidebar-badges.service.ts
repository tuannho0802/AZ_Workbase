import { Injectable, Logger } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { CustomersService } from '../customers/customers.service';
import { UsersService } from '../users/users.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { PeriodicTasksService } from '../periodic-tasks/periodic-tasks.service';
import { PermissionsVersionService } from '../permissions/permissions-version.service';
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

/**
 * [Giảm tải poll] Cache TOÀN BỘ kết quả `getBadges` theo từng user, TTL ngắn (mặc định 60 s), theo từng INSTANCE serverless.
 * Số đếm đổi theo DỮ LIỆU (task/nghỉ phép/thùng rác/tài khoản chờ duyệt), KHÔNG đổi theo permSig/refSig nên không thể chỉ
 * khoá theo các chữ ký đó. Giữ độ mới bằng 3 lớp:
 *  (1) khoá có `permissions_version` + `epoch` + role/phòng ban/vị trí -> đổi quyền/Reset hệ thống = tính lại ngay;
 *  (2) request GHI thành công đi qua instance này xoá cache (BadgeCacheInvalidationMiddleware);
 *  (3) TTL ngắn chặn trường hợp ghi xảy ra ở instance khác / cron / SQL tay (tối đa lệch ~TTL).
 * Env `SIDEBAR_BADGES_CACHE_TTL_MS`: số ms; `0` = TẮT cache (hành vi cũ, mỗi poll đếm lại).
 */
export const SIDEBAR_BADGES_CACHE_DEFAULT_TTL_MS = 60_000;
const SIDEBAR_BADGES_CACHE_MAX_ENTRIES = 300;

export function sidebarBadgesCacheTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SIDEBAR_BADGES_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return SIDEBAR_BADGES_CACHE_DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : SIDEBAR_BADGES_CACHE_DEFAULT_TTL_MS;
}

@Injectable()
export class SidebarBadgesService {
  private readonly logger = new Logger(SidebarBadgesService.name);
  // Cache theo TỪNG INSTANCE serverless (giống PermissionsService) - mất khi cold start, không sao.
  private readonly invalidDataCache = new Map<string, { value: number; expiresAt: number }>();
  // [Giảm tải poll] cache kết quả getBadges theo user + single-flight (xem SIDEBAR_BADGES_CACHE_DEFAULT_TTL_MS).
  private readonly badgesCache = new Map<string, { value: SidebarBadges; expiresAt: number }>();
  private readonly badgesInflight = new Map<string, Promise<{ out: SidebarBadges; failed: boolean }>>();
  /** Tăng mỗi lần xoá cache: kết quả của lượt tính BẮT ĐẦU TRƯỚC khi có ghi sẽ không được ghi vào cache. */
  private badgesCacheGen = 0;

  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly customersService: CustomersService,
    private readonly usersService: UsersService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly periodicTasksService: PeriodicTasksService,
    // [Reset hệ thống] Optional để spec cũ (không truyền) vẫn chạy; Nest luôn inject vì PermissionsModule là @Global().
    private readonly versionService?: PermissionsVersionService,
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

  // [AGENT] OLD CODE (giữ để rollback): safe(label, fn) không có tham số `ms`.
  // [PERF] PLAN_CPU_OPTIMIZATION_ROUND2 Mục 5A: `ms` (nếu có) là map RIÊNG của từng lần getBadges (không dùng state chung
  // vì service là singleton, nhiều request chạy song song). Chỉ truyền khi CPU_TIMING=true -> tắt = hành vi y như cũ.
  private async safe<T>(label: string, fn: () => Promise<T>, ms?: Record<string, number>): Promise<T | undefined> {
    const t0 = ms ? Date.now() : 0;
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Badge "${label}" lỗi: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    } finally {
      if (ms) ms[label] = Date.now() - t0;
    }
  }

  private async cachedInvalidData(user: SidebarBadgeUser, scope: string | null, ms?: Record<string, number>): Promise<number> {
    // [Reset hệ thống] Epoch nằm trong khoá -> Reset làm số đếm trùng SĐT được tính lại ngay thay vì chờ hết 3 phút.
    const epoch = (await this.versionService?.getEpoch()) ?? 0;
    const key = `${user.id}:${user.role}:${scope ?? 'null'}:${epoch}`;
    const now = Date.now();
    const hit = this.invalidDataCache.get(key);
    if (hit && hit.expiresAt > now) {
      if (ms) ms['invalidData.cache'] = -1; // -1 = cache HIT
      return hit.value;
    }
    if (ms) ms['invalidData.cache'] = 0; // 0 = MISS (chạy query thật)

    const value = await this.customersService.countDuplicatePhoneRecords(user.id, user.role, scope);

    if (this.invalidDataCache.size >= INVALID_DATA_CACHE_MAX_ENTRIES) {
      this.invalidDataCache.clear(); // chặn phình bộ nhớ - bounded theo số user, rất hiếm khi chạm
    }
    this.invalidDataCache.set(key, { value, expiresAt: now + INVALID_DATA_CACHE_TTL_MS });
    return value;
  }

  /** Xoá cache số đếm của instance này (gọi khi có request ghi, xem BadgeCacheInvalidationMiddleware). */
  clearBadgesCache(): void {
    this.badgesCacheGen++;
    this.badgesCache.clear();
    this.badgesInflight.clear();
  }

  // [AGENT] OLD CODE (giữ để rollback): getBadges(user) tự đếm trực tiếp mỗi lần gọi (nay là computeBadges).
  // NEW: getBadges = cache ngắn theo user + single-flight; không cache khi có badge đếm lỗi hoặc không đọc được phiên bản quyền.
  async getBadges(user: SidebarBadgeUser): Promise<SidebarBadges> {
    const ttl = sidebarBadgesCacheTtlMs();
    if (ttl <= 0) return (await this.computeBadges(user)).out;

    const [permVersion, epoch] = await Promise.all([this.versionService?.get(), this.versionService?.getEpoch()]);
    // Không đọc được phiên bản quyền/epoch: KHÔNG dùng cache để không giữ số cũ qua lần đổi quyền.
    if (permVersion === undefined || epoch === undefined) return (await this.computeBadges(user)).out;

    const key = `${user.id}:${user.role}:${user.isRootAdmin ? 1 : 0}:${user.departmentId ?? 'n'}:${user.positionId ?? 'n'}:${permVersion}:${epoch}`;
    const hit = this.badgesCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return { ...hit.value };

    let flight = this.badgesInflight.get(key);
    if (!flight) {
      const gen = this.badgesCacheGen;
      const task: Promise<{ out: SidebarBadges; failed: boolean }> = this.computeBadges(user)
        .then((r) => {
          if (!r.failed && gen === this.badgesCacheGen) {
            if (this.badgesCache.size >= SIDEBAR_BADGES_CACHE_MAX_ENTRIES) this.badgesCache.clear(); // chặn phình bộ nhớ
            this.badgesCache.set(key, { value: r.out, expiresAt: Date.now() + ttl });
          }
          return r;
        })
        .finally(() => {
          if (this.badgesInflight.get(key) === task) this.badgesInflight.delete(key);
        });
      this.badgesInflight.set(key, task);
      flight = task;
    }
    return { ...(await flight).out };
  }

  private async computeBadges(user: SidebarBadgeUser): Promise<{ out: SidebarBadges; failed: boolean }> {
    let failed = false;
    const ms: Record<string, number> | undefined = process.env.CPU_TIMING === 'true' ? {} : undefined;
    const tStart = ms ? Date.now() : 0;
    const [invalid, trash, usersManage, leaveApprove, leaveRequest, taskView] = await Promise.all([
      this.resolve(user, 'customers.invalid_report'),
      this.resolve(user, 'customers.trash_manage'),
      this.resolve(user, 'users.manage'),
      this.resolve(user, 'leave_requests.approve'),
      this.resolve(user, 'leave_requests.request'),
      this.resolve(user, 'periodic_tasks.view'),
    ]);

    const tPerm = ms ? Date.now() - tStart : 0;
    const out: SidebarBadges = {};
    const jobs: Promise<void>[] = [];
    const run = <T,>(label: string, fn: () => Promise<T>, assign: (v: T) => void) =>
      jobs.push(
        this.safe(label, fn, ms).then((v) => {
          if (v !== undefined) assign(v);
          else failed = true; // đếm lỗi -> kết quả không đầy đủ, KHÔNG được cache
        }),
      );

    if (invalid.allowed) {
      run('invalidData', () => this.cachedInvalidData(user, invalid.scope, ms), (v) => (out.invalidData = v));
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
    if (ms) {
      const parts = Object.entries(ms).map(([k, v]) =>
        k.endsWith('.cache') ? `${k}=${v === -1 ? 'HIT' : 'MISS'}` : `${k}=${v}ms`,
      );
      this.logger.log(
        `[Badges] total=${Date.now() - tStart}ms perm=${tPerm}ms ${parts.join(' ') || '(no-jobs)'} user=${user.id} role=${user.role}`,
      );
    }
    return { out, failed };
  }
}
