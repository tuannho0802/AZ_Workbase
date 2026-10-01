import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { QueryReportCustomerListDto, ReportCustomerListMetric } from './dto/query-report-customer-list.dto';
import { resolveReportRange, ResolvedReportRange } from './report-range.util';
import { applyMarketingOwnOnly } from './report-scope.util';

export const REPORT_CUSTOMER_LIST_DEFAULT_LIMIT = 10;

/** Số ghi chú chăm sóc gần nhất trả kèm mỗi dòng (hiện ở tooltip nút "Xem" của Mini Table). */
export const REPORT_RECENT_NOTES_LIMIT = 3;

type UserLike = { id: number; name: string; department?: { name: string; color?: string | null } | null };

const userBrief = (u?: UserLike | null) =>
  u
    ? {
        id: u.id,
        name: u.name,
        departmentName: u.department?.name ?? null,
        departmentColor: u.department?.color ?? null,
      }
    : null;

/**
 * DANH SÁCH KHÁCH drill-down từ các thẻ/số của trang Báo cáo (Mini Table ở FE).
 *
 * MỖI `metric` dùng ĐÚNG cột ngày + múi giờ của con số tương ứng ở `ReportsService` /
 * `ReportsMarketingService` (created_at & joined_at = UTC -> fromUtc/toUtc; closed_date & deposit_date =
 * cột `date` naive -> from/to) để bấm thẻ "127" thì ra ĐÚNG 127 khách.
 *
 * PHÂN QUYỀN: nền = CustomerAccessHelper.applyViewFilter. Riêng scope='own' (không phải Admin) siết thêm
 * CÙNG cách với tab đang xem (`context`): 'marketing' -> applyMarketingOwnOnly; 'customers' -> Sales chính = mình.
 * Dùng lại permission `reports.view` ở controller (không thêm key mới).
 */
@Injectable()
export class ReportsCustomerListService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async getList(query: QueryReportCustomerListDto, viewerId: number, viewerRole: string, scope?: string | null) {
    const range = resolveReportRange(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? REPORT_CUSTOMER_LIST_DEFAULT_LIMIT;
    const context = query.context ?? 'customers';
    const isOwnOnly = scope === PermissionScope.OWN && viewerRole !== Role.ADMIN;

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('salesUser.department', 'salesDept')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .leftJoinAndSelect('marketingUser.department', 'marketingDept')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('createdBy.department', 'createdByDept')
      .leftJoinAndSelect('customer.utm', 'rowUtm');

    CustomerAccessHelper.applyViewFilter(qb, viewerId, viewerRole, scope);
    if (isOwnOnly) {
      if (context === 'marketing') applyMarketingOwnOnly(qb, viewerId);
      // context='groups'/'utms': báo cáo Chất lượng nhóm/UTM CHỈ siết bằng applyViewFilter (không thêm rule Sales chính) -> danh sách khớp số.
      else if (context === 'customers') qb.andWhere('customer.salesUserId = :ownSalesId', { ownSalesId: viewerId });
    }

    this.applyMetric(qb, query.metric, range, query);
    this.applyFilters(qb, query);

    if (query.metric === 'closed') qb.orderBy('customer.closedDate', 'DESC').addOrderBy('customer.id', 'DESC');
    else qb.orderBy('customer.createdAt', 'DESC').addOrderBy('customer.id', 'DESC');

    const [rows, total] = await qb
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    const ids = rows.map((r) => r.id);
    const isDepositMetric = ['deposited', 'ftd', 'redeposit'].includes(query.metric);
    const depositByCustomer = isDepositMetric
      ? await this.loadDeposits(ids, range)
      : new Map<number, { amount: number; count: number; lastDate: string | null }>();
    // Metric utm_*: hiện LỊCH SỬ NẠP mọi thời điểm của khách (báo cáo UTM đo giá trị khách mang lại, không chỉ trong kỳ).
    const isUtmMetric = query.metric.startsWith('utm_') || query.metric === 'new_no_utm';
    const utmDepositByCustomer = isUtmMetric
      ? await this.loadDeposits(ids)
      : new Map<number, { amount: number; count: number; lastDate: string | null }>();
    const isGroupMetric = query.metric.startsWith('group_');
    const groupsByCustomer =
      query.metric === 'joined'
        ? await this.loadJoinedGroups(ids, range)
        : isGroupMetric
          ? await this.loadJoinedGroups(ids, undefined, query.categoryId)
          : new Map<number, string[]>();

    const { recent: notesByCustomer, counts: noteCounts } = await this.loadRecentNotes(ids);

    const data = rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      email: c.email ?? null,
      source: c.source ?? null,
      status: c.status ?? null,
      inputDate: c.inputDate ?? null,
      createdAt: c.createdAt,
      closedDate: c.closedDate ?? null,
      salesUser: userBrief(c.salesUser as UserLike | null),
      marketingUser: userBrief(c.marketingUser as UserLike | null),
      createdBy: userBrief(c.createdBy as UserLike | null),
      recentNotes: notesByCustomer.get(c.id) ?? [],
      /** TỔNG số ghi chú chăm sóc (customer_notes) - khác `recentNotes` chỉ giữ tối đa 3. */
      noteCount: noteCounts.get(c.id) ?? 0,
      ...(isUtmMetric
        ? {
            utm: c.utm ? { id: c.utm.id, name: c.utm.name, color: c.utm.color } : null,
            depositAmount: utmDepositByCustomer.get(c.id)?.amount ?? 0,
            depositCount: utmDepositByCustomer.get(c.id)?.count ?? 0,
            lastDepositDate: utmDepositByCustomer.get(c.id)?.lastDate ?? null,
          }
        : {}),
      ...(isDepositMetric
        ? {
            depositAmount: depositByCustomer.get(c.id)?.amount ?? 0,
            depositCount: depositByCustomer.get(c.id)?.count ?? 0,
            lastDepositDate: depositByCustomer.get(c.id)?.lastDate ?? null,
          }
        : {}),
      ...(query.metric === 'joined' || isGroupMetric ? { joinedGroups: groupsByCustomer.get(c.id) ?? [] } : {}),
    }));

    return {
      metric: query.metric,
      period: { type: query.period, from: range.from, to: range.to },
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Điều kiện của TỪNG chỉ số - mirror con số ở báo cáo (xem JSDoc class). */
  private applyMetric(
    qb: SelectQueryBuilder<Customer>,
    metric: ReportCustomerListMetric,
    range: ResolvedReportRange,
    query?: Pick<QueryReportCustomerListDto, 'groupId' | 'categoryId' | 'utmId' | 'utmState'>,
  ) {
    const created = () =>
      qb.andWhere('customer.createdAt BETWEEN :createdFrom AND :createdTo', {
        createdFrom: range.fromUtc,
        createdTo: range.toUtc,
      });

    // Khách là THÀNH VIÊN (joined=true) của nhóm đang xem (lọc groupId/categoryId nếu có) + điều kiện phụ `extra`.
    const groupMember = (extra = '', params: Record<string, unknown> = {}) => {
      let cond = 'gm.customer_id = customer.id AND gm.joined = true';
      const p: Record<string, unknown> = { ...params };
      if (query?.groupId) {
        cond += ' AND gm.group_id = :gGroup';
        p.gGroup = query.groupId;
      }
      if (query?.categoryId) {
        cond += ' AND gl.category_id = :gCategory';
        p.gCategory = query.categoryId;
      }
      qb.andWhere(
        `EXISTS (SELECT 1 FROM customer_group_memberships gm INNER JOIN link_groups gl ON gl.id = gm.group_id WHERE ${cond}${extra})`,
        p,
      );
    };
    const inJoinPeriod = () => ({
      sql: ' AND gm.joined_at BETWEEN :gjFrom AND :gjTo',
      params: { gjFrom: range.fromUtc, gjTo: range.toUtc },
    });

    // Khách gắn UTM đang xem: lọc utmId + góc nhìn Hoạt động/Đã khoá (đúng điều kiện `is_active` của báo cáo).
    const utmScope = () => {
      qb.andWhere('customer.utmId IS NOT NULL');
      if (query?.utmId) qb.andWhere('customer.utmId = :uUtm', { uUtm: query.utmId });
      if (query?.utmState === 'active') {
        qb.andWhere('EXISTS (SELECT 1 FROM utms ut WHERE ut.id = customer.utm_id AND ut.is_active = 1)');
      } else if (query?.utmState === 'locked') {
        qb.andWhere('EXISTS (SELECT 1 FROM utms ut WHERE ut.id = customer.utm_id AND ut.is_active = 0)');
      }
    };
    const anyDeposit = 'EXISTS (SELECT 1 FROM deposits ud WHERE ud.customer_id = customer.id)';

    switch (metric) {
      case 'utm_customers':
        utmScope();
        break;
      case 'utm_new':
        utmScope();
        created();
        break;
      case 'utm_deposited':
        utmScope();
        qb.andWhere(anyDeposit);
        break;
      case 'utm_no_deposit':
        utmScope();
        qb.andWhere(`NOT ${anyDeposit}`);
        break;
      case 'utm_closed':
        utmScope();
        qb.andWhere("customer.status = 'closed'");
        break;
      case 'utm_new_deposited':
        utmScope();
        created();
        qb.andWhere(anyDeposit);
        break;
      case 'utm_new_closed':
        utmScope();
        created();
        qb.andWhere("customer.status = 'closed'");
        break;
      case 'utm_new_no_deposit':
        utmScope();
        created();
        qb.andWhere(`NOT ${anyDeposit}`);
        break;
      case 'new_no_utm':
        created();
        qb.andWhere('customer.utmId IS NULL');
        break;
      case 'group_members':
        groupMember();
        break;
      case 'group_new_joins': {
        const j = inJoinPeriod();
        groupMember(j.sql, j.params);
        break;
      }
      case 'group_deposited':
        groupMember();
        qb.andWhere('EXISTS (SELECT 1 FROM deposits gd WHERE gd.customer_id = customer.id)');
        break;
      case 'group_no_deposit':
        groupMember();
        qb.andWhere('NOT EXISTS (SELECT 1 FROM deposits gd WHERE gd.customer_id = customer.id)');
        break;
      case 'group_closed':
        groupMember();
        qb.andWhere("customer.status = 'closed'");
        break;
      case 'group_new_deposited': {
        const j = inJoinPeriod();
        groupMember(j.sql, j.params);
        qb.andWhere('EXISTS (SELECT 1 FROM deposits gd WHERE gd.customer_id = customer.id)');
        break;
      }
      case 'group_new_closed': {
        const j = inJoinPeriod();
        groupMember(j.sql, j.params);
        qb.andWhere("customer.status = 'closed'");
        break;
      }
      case 'group_new_no_deposit': {
        const j = inJoinPeriod();
        groupMember(j.sql, j.params);
        qb.andWhere('NOT EXISTS (SELECT 1 FROM deposits gd WHERE gd.customer_id = customer.id)');
        break;
      }
      case 'new_no_group':
        created();
        qb.andWhere(
          'NOT EXISTS (SELECT 1 FROM customer_group_memberships gn WHERE gn.customer_id = customer.id AND gn.joined = true)',
        );
        break;
      case 'total':
        created();
        break;
      case 'closed':
        qb.andWhere("customer.status = 'closed' AND customer.closedDate BETWEEN :closedFrom AND :closedTo", {
          closedFrom: range.from,
          closedTo: range.to,
        });
        break;
      case 'joined':
        qb.andWhere(
          'EXISTS (SELECT 1 FROM customer_group_memberships m WHERE m.customer_id = customer.id AND m.joined = true ' +
            'AND m.joined_at BETWEEN :joinedFrom AND :joinedTo)',
          { joinedFrom: range.fromUtc, joinedTo: range.toUtc },
        );
        break;
      case 'deposited':
        qb.andWhere(
          'EXISTS (SELECT 1 FROM deposits d WHERE d.customer_id = customer.id AND d.deposit_date BETWEEN :depFrom AND :depTo)',
          { depFrom: range.from, depTo: range.to },
        );
        break;
      case 'cohort_deposited':
        created();
        qb.andWhere('EXISTS (SELECT 1 FROM deposits dd WHERE dd.customer_id = customer.id)');
        break;
      case 'cohort_closed':
        created();
        qb.andWhere("customer.status = 'closed'");
        break;
      case 'cohort_joined':
        created();
        qb.andWhere(
          'EXISTS (SELECT 1 FROM customer_group_memberships mj WHERE mj.customer_id = customer.id AND mj.joined = true)',
        );
        break;
      case 'ftd':
        // Khách có KHOẢN NẠP ĐẦU TIÊN (deposit_date, id nhỏ nhất) rơi trong kỳ - khớp `ftdCount` ở báo cáo doanh thu.
        qb.andWhere(
          'EXISTS (SELECT 1 FROM deposits d WHERE d.customer_id = customer.id AND d.deposit_date BETWEEN :depFrom AND :depTo ' +
            'AND d.id = (SELECT d2.id FROM deposits d2 WHERE d2.customer_id = d.customer_id ORDER BY d2.deposit_date ASC, d2.id ASC LIMIT 1))',
          { depFrom: range.from, depTo: range.to },
        );
        break;
      case 'redeposit':
        // Khách có khoản nạp trong kỳ KHÔNG phải khoản nạp đầu tiên của họ (nạp lại).
        qb.andWhere(
          'EXISTS (SELECT 1 FROM deposits d WHERE d.customer_id = customer.id AND d.deposit_date BETWEEN :depFrom AND :depTo ' +
            'AND d.id <> (SELECT d2.id FROM deposits d2 WHERE d2.customer_id = d.customer_id ORDER BY d2.deposit_date ASC, d2.id ASC LIMIT 1))',
          { depFrom: range.from, depTo: range.to },
        );
        break;
      case 'unassigned_marketing':
        created();
        qb.andWhere('customer.marketingUserId IS NULL');
        break;
    }
  }

  private applyFilters(qb: SelectQueryBuilder<Customer>, q: QueryReportCustomerListDto) {
    if (q.marketingUserId !== undefined) {
      if (q.marketingUserId === 0) qb.andWhere('customer.marketingUserId IS NULL');
      else qb.andWhere('customer.marketingUserId = :fMarketing', { fMarketing: q.marketingUserId });
    }
    if (q.createdById !== undefined) {
      if (q.createdById === 0) qb.andWhere('customer.createdById IS NULL');
      else qb.andWhere('customer.createdById = :fCreator', { fCreator: q.createdById });
    }
    if (q.salesUserId !== undefined) qb.andWhere('customer.salesUserId = :fSales', { fSales: q.salesUserId });
    if (q.source) qb.andWhere('customer.source = :fSource', { fSource: q.source });
    if (q.status) qb.andWhere('customer.status = :fStatus', { fStatus: q.status });
    // "Ngày nhập khách" = inputDate (cột `date`, không giờ) - KHÁC createdAt, cùng quy ước với /customers.
    if (q.dateFrom) qb.andWhere('customer.inputDate >= :fInFrom', { fInFrom: q.dateFrom.slice(0, 10) });
    if (q.dateTo) qb.andWhere('customer.inputDate <= :fInTo', { fInTo: q.dateTo.slice(0, 10) });

    const search = q.search?.trim();
    if (search) {
      // Escape % _ để ký tự đặc biệt không thành wildcard ngoài ý muốn.
      const like = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      qb.andWhere('(customer.name LIKE :fSearch OR customer.phone LIKE :fSearch OR customer.email LIKE :fSearch)', {
        fSearch: like,
      });
    }

    if (q.quick === 'no_marketing') qb.andWhere('customer.marketingUserId IS NULL');
    else if (q.quick === 'no_sales') qb.andWhere('customer.salesUserId IS NULL');
    else if (q.quick === 'no_phone') qb.andWhere("(customer.phone IS NULL OR customer.phone = '')");
  }

  /** Tổng tiền / số lần / ngày nạp gần nhất (TRONG KỲ nếu có `range`, ngược lại mọi thời điểm) của các khách trong trang hiện tại (1 query cho cả trang). */
  private async loadDeposits(
    ids: number[],
    range?: ResolvedReportRange,
  ): Promise<Map<number, { amount: number; count: number; lastDate: string | null }>> {
    const map = new Map<number, { amount: number; count: number; lastDate: string | null }>();
    if (ids.length === 0) return map;
    const dq = this.customerRepo.manager
      .createQueryBuilder()
      .select('d.customerId', 'customerId')
      .addSelect('SUM(d.amount)', 'amount')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('MAX(d.depositDate)', 'lastDate')
      .from(Deposit, 'd')
      .where('d.customerId IN (:...ids)', { ids });
    // Không có `range` -> LỊCH SỬ nạp mọi thời điểm (metric utm_*).
    if (range) dq.andWhere('d.depositDate BETWEEN :depFrom AND :depTo', { depFrom: range.from, depTo: range.to });
    const rows = await dq.groupBy('d.customerId').getRawMany();
    for (const r of rows) {
      map.set(Number(r.customerId), {
        amount: Number(r.amount) || 0,
        count: Number(r.cnt) || 0,
        lastDate: r.lastDate ? String(r.lastDate).slice(0, 10) : null,
      });
    }
    return map;
  }

  /** Tên các nhóm khách đã join TRONG KỲ (1 query cho cả trang). */
  /**
   * Tên các nhóm khách đã join. Có `range` -> chỉ nhóm join TRONG KỲ (metric 'joined'); không có -> mọi nhóm đã join
   * (các metric group_*), tuỳ chọn thu hẹp theo Category để khớp bộ lọc của báo cáo nhóm.
   */
  private async loadJoinedGroups(
    ids: number[],
    range?: ResolvedReportRange,
    categoryId?: number,
  ): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (ids.length === 0) return map;
    const gq = this.customerRepo.manager
      .createQueryBuilder()
      .select('m.customerId', 'customerId')
      .addSelect('g.name', 'name')
      .from(CustomerGroupMembership, 'm')
      .innerJoin('m.group', 'g')
      .where('m.customerId IN (:...ids)', { ids })
      .andWhere('m.joined = true');
    if (range) {
      gq.andWhere('m.joinedAt BETWEEN :joinedFrom AND :joinedTo', { joinedFrom: range.fromUtc, joinedTo: range.toUtc });
    }
    if (categoryId) gq.andWhere('g.categoryId = :gcat', { gcat: categoryId });
    const rows = await gq.orderBy('m.joinedAt', 'ASC').getRawMany();
    for (const r of rows) {
      const list = map.get(Number(r.customerId)) ?? [];
      list.push(String(r.name));
      map.set(Number(r.customerId), list);
    }
    return map;
  }

  /** Tối đa 3 ghi chú CHĂM SÓC (customer_notes) mới nhất của mỗi khách - 1 query cho cả trang, không N+1. */
  private async loadRecentNotes(
    ids: number[],
  ): Promise<{
    recent: Map<number, { id: number; note: string; createdAt: Date; createdByName: string | null }[]>;
    counts: Map<number, number>;
  }> {
    const map = new Map<number, { id: number; note: string; createdAt: Date; createdByName: string | null }[]>();
    const counts = new Map<number, number>();
    if (ids.length === 0) return { recent: map, counts };
    const rows = await this.customerRepo.manager
      .createQueryBuilder(CustomerNote, 'n')
      .leftJoinAndSelect('n.createdByUser', 'nBy')
      .where('n.customerId IN (:...ids)', { ids })
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .getMany();
    for (const n of rows) {
      counts.set(n.customerId, (counts.get(n.customerId) ?? 0) + 1);
      const list = map.get(n.customerId) ?? [];
      if (list.length < REPORT_RECENT_NOTES_LIMIT) {
        list.push({ id: n.id, note: n.note, createdAt: n.createdAt, createdByName: n.createdByUser?.name ?? null });
        map.set(n.customerId, list);
      }
    }
    return { recent: map, counts };
  }
}
