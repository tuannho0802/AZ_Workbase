import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomersService } from './customers.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { CustomerAssignment } from '../../database/entities/customer-assignment.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UtmsService } from '../utms/utms.service';
import { BulkOperationsService } from '../bulk-operations/bulk-operations.service';
import { Role } from '../../common/enums/role.enum';

/**
 * 3 modal thống kê (Khách mới hôm nay / theo trạng thái / Nạp tiền) chỉ được select đúng cột FE đọc
 * (StatModals.tsx) - KHÔNG kéo cả entity Customer/User như trước. QueryBuilder giả ghi lại các lời gọi.
 */
type Calls = { select: any[][]; addSelect: any[][]; leftJoin: any[][]; leftJoinAndSelect: any[][]; limit: any[][]; where: any[][] };

function makeQb(calls: Calls) {
  const qb: any = {};
  const chain = (name: keyof Calls) =>
    jest.fn((...args: any[]) => {
      (calls[name] as any[]).push(args);
      return qb;
    });
  qb.select = chain('select');
  qb.addSelect = chain('addSelect');
  qb.leftJoin = chain('leftJoin');
  qb.leftJoinAndSelect = chain('leftJoinAndSelect');
  qb.limit = chain('limit');
  qb.where = chain('where');
  qb.andWhere = jest.fn(() => qb);
  qb.orderBy = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue([]);
  return qb;
}
const newCalls = (): Calls => ({ select: [], addSelect: [], leftJoin: [], leftJoinAndSelect: [], limit: [], where: [] });

describe('CustomersService - cột select của 3 modal thống kê', () => {
  let service: CustomersService;
  let customerQbs: Calls[];
  let depositQbs: Calls[];

  beforeEach(async () => {
    customerQbs = [];
    depositQbs = [];
    const customerRepo = {
      createQueryBuilder: jest.fn(() => {
        const c = newCalls();
        customerQbs.push(c);
        return makeQb(c);
      }),
    };
    const depositRepo = {
      createQueryBuilder: jest.fn(() => {
        const c = newCalls();
        depositQbs.push(c);
        return makeQb(c);
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
        { provide: getRepositoryToken(CustomerNote), useValue: {} },
        { provide: getRepositoryToken(Deposit), useValue: depositRepo },
        { provide: getRepositoryToken(CustomerAssignment), useValue: {} },
        { provide: getRepositoryToken(CustomerGroupMembership), useValue: {} },
        { provide: getRepositoryToken(CustomerStatus), useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
        { provide: UiVisibilityService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: UtmsService, useValue: {} },
        { provide: BulkOperationsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(CustomersService);
  });

  const CUSTOMER_COLS = ['customer.id', 'customer.name', 'customer.phone', 'customer.status', 'customer.createdAt', 'customer.updatedAt'];
  const userCols = (a: string) => [`${a}.id`, `${a}.name`, `${a}.email`, `${a}.role`];
  const selected = (c: Calls) => c.addSelect.map((a) => a[0]);

  it('getStatsToday: chỉ cột cần thiết, join salesUser/createdBy/updatedBy KHÔNG kéo cả entity, giữ limit 500/50', async () => {
    await service.getStatsToday(1, Role.ADMIN);

    expect(customerQbs).toHaveLength(2); // todayQuery + historyQuery
    for (const c of customerQbs) {
      expect(c.leftJoinAndSelect).toHaveLength(0);
      expect(c.select[0][0]).toEqual(CUSTOMER_COLS);
      expect(c.leftJoin.map((a) => a[1])).toEqual(['salesUser', 'createdBy', 'updatedBy']);
      expect(selected(c)).toEqual([userCols('salesUser'), userCols('createdBy'), userCols('updatedBy')]);
    }
    expect(customerQbs.flatMap((c) => c.limit.map((a) => a[0])).sort()).toEqual([50, 500]);
  });

  it('getStatsByStatus: chỉ cột cần thiết, KHÔNG join updatedBy (giữ hành vi cũ), giữ limit 1000', async () => {
    await service.getStatsByStatus(1, Role.ADMIN);

    expect(customerQbs).toHaveLength(2); // closed + notClosed
    for (const c of customerQbs) {
      expect(c.leftJoinAndSelect).toHaveLength(0);
      expect(c.select[0][0]).toEqual(CUSTOMER_COLS);
      expect(c.leftJoin.map((a) => a[1])).toEqual(['salesUser', 'createdBy']);
      expect(selected(c)).toEqual([userCols('salesUser'), userCols('createdBy')]);
      expect(c.limit.map((a) => a[0])).toEqual([1000]);
    }
  });

  it('getAllDepositsStats: chỉ cột cần thiết của deposit/customer/createdBy/salesUser, giữ điều kiện xoá mềm + limit 1000', async () => {
    await service.getAllDepositsStats(1, Role.ADMIN);

    expect(depositQbs).toHaveLength(1);
    const c = depositQbs[0];
    expect(c.leftJoinAndSelect).toHaveLength(0);
    expect(c.select[0][0]).toEqual([
      'deposit.id', 'deposit.amount', 'deposit.depositDate', 'deposit.broker', 'deposit.note', 'deposit.createdAt',
    ]);
    expect(c.leftJoin.map((a) => [a[0], a[1]])).toEqual([
      ['deposit.customer', 'customer'],
      ['deposit.createdBy', 'createdBy'],
      ['customer.salesUser', 'salesUser'],
    ]);
    expect(selected(c)).toEqual([['customer.id', 'customer.name'], userCols('createdBy'), userCols('salesUser')]);
    expect(c.where[0][0]).toBe('customer.deletedAt IS NULL');
    expect(c.limit.map((a) => a[0])).toEqual([1000]);
  });
});
