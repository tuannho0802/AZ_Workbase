import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { QueryReportCustomerListDto, ReportCustomerListMetric } from './dto/query-report-customer-list.dto';
import { resolveReportRange, ResolvedReportRange } from './report-range.util';
import { applyMarketingOwnOnly } from './report-scope.util';

export const REPORT_CUSTOMER_LIST_DEFAULT_LIMIT = 10;

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
      .leftJoinAndSelect('createdBy.department', 'createdByDept');

    CustomerAccessHelper.applyViewFilter(qb, viewerId, viewerRole, scope);
    if (isOwnOnly) {
      if (context === 'marketing') applyMarketingOwnOnly(qb, viewerId);
      else qb.andWhere('customer.salesUserId = :ownSalesId', { ownSalesId: viewerId });
    }

    this.applyMetric(qb, query.metric, range);
    this.applyFilters(qb, query);

    if (query.metric === 'closed') qb.orderBy('customer.closedDate', 'DESC').addOrderBy('customer.id', 'DESC');
    else qb.orderBy('customer.createdAt', 'DESC').addOrderBy('customer.id', 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const ids = rows.map((r) => r.id);
    const depositByCustomer =
      query.metric === 'deposited' ? await this.loadDeposits(ids, range) : new Map<number, number>();
    const groupsByCustomer =
      query.metric === 'joined' ? await this.loadJoinedGroups(ids, range) : new Map<number, string[]>();

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
      ...(query.metric === 'deposited' ? { depositAmount: depositByCustomer.get(c.id) ?? 0 } : {}),
      ...(query.metric === 'joined' ? { joinedGroups: groupsByCustomer.get(c.id) ?? [] } : {}),
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
  private applyMetric(qb: SelectQueryBuilder<Customer>, metric: ReportCustomerListMetric, range: ResolvedReportRange) {
    const created = () =>
      qb.andWhere('customer.createdAt BETWEEN :createdFrom AND :createdTo', {
        createdFrom: range.fromUtc,
        createdTo: range.toUtc,
      });

    switch (metric) {
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

  /** Tổng tiền nạp TRONG KỲ của các khách trong trang hiện tại (1 query cho cả trang). */
  private async loadDeposits(ids: number[], range: ResolvedReportRange): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (ids.length === 0) return map;
    const rows = await this.customerRepo.manager
      .createQueryBuilder()
      .select('d.customerId', 'customerId')
      .addSelect('SUM(d.amount)', 'amount')
      .from(Deposit, 'd')
      .where('d.customerId IN (:...ids)', { ids })
      .andWhere('d.depositDate BETWEEN :depFrom AND :depTo', { depFrom: range.from, depTo: range.to })
      .groupBy('d.customerId')
      .getRawMany();
    for (const r of rows) map.set(Number(r.customerId), Number(r.amount) || 0);
    return map;
  }

  /** Tên các nhóm khách đã join TRONG KỲ (1 query cho cả trang). */
  private async loadJoinedGroups(ids: number[], range: ResolvedReportRange): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (ids.length === 0) return map;
    const rows = await this.customerRepo.manager
      .createQueryBuilder()
      .select('m.customerId', 'customerId')
      .addSelect('g.name', 'name')
      .from(CustomerGroupMembership, 'm')
      .innerJoin('m.group', 'g')
      .where('m.customerId IN (:...ids)', { ids })
      .andWhere('m.joined = true')
      .andWhere('m.joinedAt BETWEEN :joinedFrom AND :joinedTo', { joinedFrom: range.fromUtc, joinedTo: range.toUtc })
      .orderBy('m.joinedAt', 'ASC')
      .getRawMany();
    for (const r of rows) {
      const list = map.get(Number(r.customerId)) ?? [];
      list.push(String(r.name));
      map.set(Number(r.customerId), list);
    }
    return map;
  }
}
