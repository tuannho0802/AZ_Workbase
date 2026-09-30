import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequest, LeaveStatus } from '../../database/entities/leave-request.entity';
import { User } from '../../database/entities/user.entity';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import {
  resolveReportRange,
  resolvePreviousReportRange,
  spanDaysOf,
  ResolvedReportRange,
} from '../reports/report-range.util';
import { LeaveRequestsService } from './leave-requests.service';
import { QueryLeaveStatsDto } from './dto/query-leave-stats.dto';
import {
  buildLeaveStats,
  granularityFor,
  summarize,
  HeadcountRow,
  LeaveStatRow,
  LeaveStatsResult,
  LeaveStatsSummary,
  StatsGranularity,
} from './leave-stats.util';

export interface LeaveStatsResponse extends LeaveStatsResult {
  period: { type: string; from: string; to: string; granularity: StatsGranularity; spanDays: number };
  previousPeriod: { from: string; to: string };
  /** Quân số hiện tại trong phạm vi + bộ lọc (tài khoản đang hoạt động, đã được duyệt). */
  headcount: number;
  previousSummary: LeaveStatsSummary;
}

/**
 * Thống kê nghỉ phép cho tab "Thống kê" ở trang Duyệt phép. Phạm vi xem dùng ĐÚNG
 * scope của `leave_requests.view` qua `LeaveRequestsService.applyApproverScope()`
 * (nguồn duy nhất, giống tab Lịch sử) - không tự viết lại rule phân quyền ở đây.
 * Số liệu/định nghĩa tỷ lệ: xem đầu `leave-stats.util.ts`.
 */
@Injectable()
export class LeaveRequestsStatsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly leaveRequestsService: LeaveRequestsService,
  ) {}

  async getStats(
    q: QueryLeaveStatsDto,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ): Promise<LeaveStatsResponse> {
    const range = resolveReportRange(q);
    const prev = resolvePreviousReportRange(q);
    const spanDays = spanDaysOf(range);
    const granularity = granularityFor(spanDays);
    const period = { type: q.period, from: range.from, to: range.to, granularity, spanDays };
    const previousPeriod = { from: prev.from, to: prev.to };

    // Không có phạm vi xem hợp lệ -> trả bộ số 0 (cùng hành vi emptyWeekModeResponse ở các tab danh sách).
    if (!this.leaveRequestsService.hasApproverScope(viewerRole, scope)) {
      const empty = buildLeaveStats([], [], range, granularity);
      return { ...empty, period, previousPeriod, headcount: 0, previousSummary: summarize([], 0) };
    }

    const [headcountRows, rows, prevRows] = await Promise.all([
      this.loadHeadcount(q, viewerId, viewerRole, scope),
      this.loadRows(range, q, viewerId, viewerRole, scope),
      this.loadRows(prev, q, viewerId, viewerRole, scope),
    ]);

    const result = buildLeaveStats(rows, headcountRows, range, granularity);
    const memberIds = new Set(headcountRows.map((h) => h.userId));
    return {
      ...result,
      period,
      previousPeriod,
      headcount: headcountRows.length,
      previousSummary: summarize(prevRows, headcountRows.length, memberIds),
    };
  }

  private async loadRows(
    range: ResolvedReportRange,
    q: QueryLeaveStatsDto,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ): Promise<LeaveStatRow[]> {
    const from = range.from.slice(0, 10);
    const to = range.to.slice(0, 10);
    const qb = this.leaveRepo
      .createQueryBuilder('leave')
      .innerJoin('leave.requester', 'requester')
      .leftJoin('requester.department', 'department')
      .select([
        'leave.id',
        'leave.requesterId',
        'leave.leaveType',
        'leave.status',
        'leave.startDate',
        'leave.endDate',
        'leave.totalDays',
        'leave.isSupplementary',
        'requester.id',
        'requester.name',
        'requester.departmentId',
        'department.id',
        'department.name',
      ])
      // Đơn trong Thùng rác (cancelled) không tính vào thống kê.
      .where('leave.status IN (:...statuses)', {
        statuses: [LeaveStatus.PENDING, LeaveStatus.APPROVED, LeaveStatus.REJECTED],
      })
      // Giao khoảng: startDate <= to AND endDate >= from (cùng rule bộ lọc ngày các tab danh sách).
      .andWhere('leave.startDate <= :statsTo', { statsTo: to })
      .andWhere('leave.endDate >= :statsFrom', { statsFrom: from });

    await this.leaveRequestsService.applyApproverScope(qb, viewerId, viewerRole, scope);
    if (q.departmentId) qb.andWhere('requester.departmentId = :statsDeptId', { statsDeptId: q.departmentId });
    if (q.leaveType) qb.andWhere('leave.leaveType = :statsLeaveType', { statsLeaveType: q.leaveType });
    if (q.requesterId) qb.andWhere('leave.requesterId = :statsRequesterId', { statsRequesterId: q.requesterId });

    const entities = await qb.getMany();
    return entities.map((l) => ({
      id: l.id,
      requesterId: l.requesterId,
      requesterName: l.requester?.name ?? `#${l.requesterId}`,
      departmentId: l.requester?.departmentId ?? null,
      departmentName: l.requester?.department?.name ?? null,
      leaveType: l.leaveType,
      status: l.status,
      startDate: l.startDate,
      endDate: l.endDate,
      totalDays: Number(l.totalDays) || 0,
      isSupplementary: !!l.isSupplementary,
    }));
  }

  private async loadHeadcount(
    q: QueryLeaveStatsDto,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ): Promise<HeadcountRow[]> {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoin('user.department', 'department')
      .select(['user.id', 'user.departmentId', 'department.id', 'department.name'])
      // BooleanTransformer KHÔNG chạy trong QueryBuilder.where() -> truyền số 1 thủ công (SKILL_NESTJS_BACKEND mục 10).
      .where('user.isActive = :statsActive', { statsActive: 1 })
      .andWhere('user.approvalStatus = :statsApproved', { statsApproved: ApprovalStatus.APPROVED });

    await this.leaveRequestsService.applyApproverScopeToUsers(qb, viewerId, viewerRole, scope);
    if (q.departmentId) qb.andWhere('user.departmentId = :statsDeptId', { statsDeptId: q.departmentId });
    if (q.requesterId) qb.andWhere('user.id = :statsRequesterId', { statsRequesterId: q.requesterId });

    const users = await qb.getMany();
    return users.map((u) => ({
      userId: u.id,
      departmentId: u.departmentId ?? null,
      departmentName: u.department?.name ?? null,
    }));
  }
}
