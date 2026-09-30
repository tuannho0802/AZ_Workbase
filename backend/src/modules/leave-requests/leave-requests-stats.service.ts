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
import { QueryLeaveStatsRequestsDto } from './dto/query-leave-stats-requests.dto';
import {
  buildLeaveStats,
  filterLeaveRowsForDrill,
  granularityFor,
  toYmd,
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

  /**
   * Mini Table đơn nghỉ đứng sau Card/Chart của tab Thống kê. Chọn đơn bằng ĐÚNG `loadRows()` của getStats()
   * (cùng kỳ, scope, bộ lọc, loại Thùng rác) rồi lọc drill-down bằng `filterLeaveRowsForDrill()` (cùng định nghĩa
   * bucket/thứ với biểu đồ) -> tổng số dòng luôn KHỚP con số được bấm. Sắp xếp: ngày bắt đầu nghỉ mới nhất trước.
   */
  async getRequests(q: QueryLeaveStatsRequestsDto, viewerId: number, viewerRole: string, scope?: string | null) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const range = resolveReportRange(q);
    const granularity = granularityFor(spanDaysOf(range));
    const period = { type: q.period, from: range.from, to: range.to, granularity };
    const empty = { data: [] as LeaveRequest[], total: 0, totalDays: 0, page, limit, totalPages: 0, period };
    if (!this.leaveRequestsService.hasApproverScope(viewerRole, scope)) return empty;

    const rows = await this.loadRows(range, q, viewerId, viewerRole, scope);
    const matched = filterLeaveRowsForDrill(
      rows,
      {
        status: q.status as any,
        quick: q.quick,
        requesterIds: q.requesterIds ? q.requesterIds.split(',').map(Number) : undefined,
        weekday: q.weekday,
        bucket: q.bucket,
        fromDate: q.fromDate,
        toDate: q.toDate,
        search: q.search,
      },
      range,
      granularity,
    ).sort((a, b) => toYmd(b.startDate).localeCompare(toYmd(a.startDate)) || b.id - a.id);

    const total = matched.length;
    const totalDays = Math.round(matched.reduce((sum, r) => sum + r.totalDays, 0) * 10) / 10;
    const pageIds = matched.slice((page - 1) * limit, page * limit).map((r) => r.id);
    if (pageIds.length === 0) return { ...empty, total, totalDays, totalPages: Math.ceil(total / limit) };

    const entities = await this.leaveRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .leftJoinAndSelect('leave.approver', 'approver')
      .loadRelationCountAndMap('leave.attachmentCount', 'leave.attachments')
      .whereInIds(pageIds)
      .getMany();
    const byId = new Map(entities.map((e) => [e.id, e]));
    const data = pageIds.map((id) => byId.get(id)).filter((e): e is LeaveRequest => !!e);
    return { data, total, totalDays, page, limit, totalPages: Math.ceil(total / limit), period };
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
