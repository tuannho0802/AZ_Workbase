import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { applyMarketingOwnOnly } from './report-scope.util';

type UserLike = { id: number; name: string; department?: { name: string; color?: string | null } | null };

const userBrief = (u?: UserLike | null) =>
  u
    ? { id: u.id, name: u.name, departmentName: u.department?.name ?? null, departmentColor: u.department?.color ?? null }
    : null;

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
};
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);

export interface DepositStageRow {
  id: number;
  /** 1 = nạp lần đầu (FTD), >=2 = nạp lại. */
  order: number;
  stage: 'ftd' | 'redeposit';
  amount: number;
  depositDate: string;
  /** Tổng nạp luỹ kế tới hết khoản này. */
  cumulative: number;
  /** Số ngày kể từ khoản nạp liền trước (null với khoản đầu). */
  daysSincePrevious: number | null;
  broker: string | null;
  note: string | null;
  createdBy: { id: number; name: string } | null;
}

/**
 * CHI TIẾT 1 KHÁCH (chỉ xem) cho modal "Thông tin" ở Mini Table báo cáo: thông tin chung + LỊCH SỬ NẠP chia
 * giai đoạn (nạp đầu / nạp lại #n, luỹ kế, khoảng cách ngày) + nhóm đã join.
 *
 * PHÂN QUYỀN: cùng nền `applyViewFilter` như danh sách; scope='own' (không phải Admin) siết thêm cùng cách với tab
 * đang xem (`context`). Không thấy -> 404 (không lộ việc khách có tồn tại). Dùng `reports.view` ở controller.
 */
@Injectable()
export class ReportsCustomerDetailService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async getDetail(
    id: number,
    context: 'customers' | 'marketing' | 'groups' | undefined,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ) {
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('salesUser.department', 'salesDept')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .leftJoinAndSelect('marketingUser.department', 'marketingDept')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('createdBy.department', 'createdByDept')
      .where('customer.id = :id', { id });

    CustomerAccessHelper.applyViewFilter(qb, viewerId, viewerRole, scope);
    if (scope === PermissionScope.OWN && viewerRole !== Role.ADMIN) {
      if (context === 'marketing') applyMarketingOwnOnly(qb, viewerId);
      // context='groups': khớp báo cáo Chất lượng nhóm - chỉ siết bằng applyViewFilter ở trên.
      else if (context !== 'groups') qb.andWhere('customer.salesUserId = :ownSalesId', { ownSalesId: viewerId });
    }

    const c = await qb.getOne();
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');

    const depositRows = await this.customerRepo.manager
      .createQueryBuilder(Deposit, 'd')
      .leftJoinAndSelect('d.createdBy', 'dBy')
      .where('d.customerId = :id', { id })
      .orderBy('d.depositDate', 'ASC')
      .addOrderBy('d.id', 'ASC')
      .getMany();

    let cumulative = 0;
    let prevDate: string | null = null;
    const deposits: DepositStageRow[] = depositRows.map((d, i) => {
      const date = dateOnly(d.depositDate as unknown as Date | string) ?? '';
      const amount = Number(d.amount) || 0;
      cumulative = Math.round((cumulative + amount) * 100) / 100;
      const row: DepositStageRow = {
        id: d.id,
        order: i + 1,
        stage: i === 0 ? 'ftd' : 'redeposit',
        amount,
        depositDate: date,
        cumulative,
        daysSincePrevious: prevDate ? Math.max(0, daysBetween(prevDate, date)) : null,
        broker: d.broker ?? null,
        note: d.note ?? null,
        createdBy: d.createdBy ? { id: d.createdBy.id, name: d.createdBy.name } : null,
      };
      prevDate = date;
      return row;
    });

    const totalAmount = cumulative;
    const first = deposits[0] ?? null;
    const last = deposits[deposits.length - 1] ?? null;
    const inputDate = dateOnly(c.inputDate as unknown as Date | string);
    const summary = {
      totalAmount,
      depositCount: deposits.length,
      averageAmount: deposits.length ? Math.round((totalAmount / deposits.length) * 100) / 100 : 0,
      maxAmount: deposits.reduce((m, d) => Math.max(m, d.amount), 0),
      firstDepositDate: first?.depositDate ?? null,
      lastDepositDate: last?.depositDate ?? null,
      /** Số ngày từ ngày nhập khách tới khoản nạp đầu tiên. */
      daysToFirstDeposit: first && inputDate ? Math.max(0, daysBetween(inputDate, first.depositDate)) : null,
      /** Số ngày giữa khoản nạp đầu và khoản nạp gần nhất. */
      depositSpanDays: first && last ? daysBetween(first.depositDate, last.depositDate) : null,
    };

    const memberships = await this.customerRepo.manager
      .createQueryBuilder(CustomerGroupMembership, 'm')
      .innerJoinAndSelect('m.group', 'g')
      .where('m.customerId = :id', { id })
      .andWhere('m.joined = true')
      .orderBy('m.joinedAt', 'ASC')
      .getMany();

    // Ghi chú CHĂM SÓC (bảng customer_notes) - khác `customer.note` (ghi chú chung, cột của bảng customers).
    // Chỉ xem: cùng phạm vi khách đã qua `applyViewFilter` ở trên nên không cần gác thêm.
    const noteRows = await this.customerRepo.manager
      .createQueryBuilder(CustomerNote, 'n')
      .leftJoinAndSelect('n.createdByUser', 'nBy')
      .where('n.customerId = :id', { id })
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .getMany();

    return {
      customer: {
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
        email: c.email ?? null,
        source: c.source ?? null,
        campaign: c.campaign ?? null,
        broker: c.broker ?? null,
        status: c.status ?? null,
        note: c.note ?? null,
        inputDate,
        assignedDate: dateOnly(c.assignedDate as unknown as Date | string),
        closedDate: dateOnly(c.closedDate as unknown as Date | string),
        createdAt: c.createdAt,
        salesUser: userBrief(c.salesUser as UserLike | null),
        marketingUser: userBrief(c.marketingUser as UserLike | null),
        createdBy: userBrief(c.createdBy as UserLike | null),
      },
      deposits,
      depositSummary: summary,
      careNotes: noteRows.map((n) => ({
        id: n.id,
        note: n.note,
        noteType: n.noteType,
        isImportant: !!n.isImportant,
        createdAt: n.createdAt,
        createdBy: n.createdByUser ? { id: n.createdByUser.id, name: n.createdByUser.name } : null,
      })),
      groups: memberships.map((m) => ({ id: m.groupId, name: m.group?.name ?? '—', joinedAt: m.joinedAt })),
    };
  }
}
