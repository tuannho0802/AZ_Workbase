import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { LinkGroupManagersService } from './link-group-managers.service';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { GroupCustomersQueryDto } from './dto/group-customers-query.dto';

export interface GroupCustomerRow {
  id: number;
  name: string;
  phone: string | null;
  source: string;
  status: string;
  inputDate: Date | null;
  createdAt: Date;
  joinedAt: Date | null;
  salesUser?: { id: number; name: string } | null;
  marketingUser?: { id: number; name: string } | null;
}

interface Caller {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

/**
 * Khách hàng ĐÃ JOIN (`customer_group_memberships.joined = true`) của từng
 * nhóm liên kết - phục vụ nút "Xem khách hàng (N)" ở trang "Nhóm tôi quản lý".
 *
 * Quyền: chỉ người được XEM nhóm đó (admin/quyền rộng, Quản lý chính/phụ,
 * Nhân viên Content) - tái dùng `LinkGroupManagersService.getManagers()`
 * (ném 403 nếu không đủ quyền) thay vì tự viết lại rule. Số liệu KHÔNG lọc
 * theo scope `customers.view` của người xem (quản lý nhóm cần thấy đủ thành
 * viên để đối chiếu) - vì vậy `count` và danh sách luôn khớp nhau. Field bị ẩn
 * theo "UI Visibility" (Sales/Marketing phụ trách) vẫn được strip như
 * `CustomersService.findAll()`.
 */
@Injectable()
export class LinkGroupCustomersService {
  constructor(
    @InjectRepository(CustomerGroupMembership)
    private readonly membershipRepo: Repository<CustomerGroupMembership>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly managersService: LinkGroupManagersService,
    private readonly uiVisibilityService: UiVisibilityService,
  ) {}

  /** `{ [groupId]: số khách đã join }` cho các nhóm caller được xem (0 nếu chưa có). */
  async getCounts(caller: Caller): Promise<Record<number, number>> {
    const groups = await this.managersService.listManagedByMe(caller.id, caller.role, caller.isRootAdmin);
    const ids = groups.map((g) => g.groupId);
    const result: Record<number, number> = {};
    ids.forEach((id) => (result[id] = 0));
    if (ids.length === 0) return result;

    const rows = await this.membershipRepo
      .createQueryBuilder('m')
      .innerJoin('m.customer', 'c', 'c.deletedAt IS NULL')
      .select('m.groupId', 'groupId')
      .addSelect('COUNT(DISTINCT m.customerId)', 'cnt')
      .where('m.joined = :joined', { joined: 1 }) // BooleanTransformer/QueryBuilder: truyền 1 thủ công
      .andWhere('m.groupId IN (:...ids)', { ids })
      .groupBy('m.groupId')
      .getRawMany();

    rows.forEach((r) => (result[Number(r.groupId)] = Number(r.cnt)));
    return result;
  }

  async listCustomers(groupId: number, query: GroupCustomersQueryDto, caller: Caller) {
    // 403/404 nếu không có quyền xem nhóm này.
    await this.managersService.getManagers(groupId, caller.id, caller.role, caller.isRootAdmin);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .innerJoin(
        CustomerGroupMembership,
        'm',
        'm.customer_id = customer.id AND m.group_id = :groupId AND m.joined = 1',
        { groupId },
      )
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .where('customer.deletedAt IS NULL');

    if (query.search) {
      const kw = `%${query.search.trim()}%`;
      qb.andWhere('(customer.name LIKE :kw OR customer.phone LIKE :kw)', { kw });
    }
    if (query.status) qb.andWhere('customer.status = :status', { status: query.status });
    if (query.source) qb.andWhere('customer.source = :source', { source: query.source });
    if (query.salesUserId) qb.andWhere('customer.salesUserId = :salesUserId', { salesUserId: query.salesUserId });
    if (query.marketingUserId) {
      qb.andWhere('customer.marketingUserId = :marketingUserId', { marketingUserId: query.marketingUserId });
    }
    if (query.dateFrom) qb.andWhere('customer.inputDate >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('customer.inputDate <= :dateTo', { dateTo: query.dateTo });

    qb.orderBy('customer.createdAt', 'DESC').addOrderBy('customer.id', 'DESC').skip((page - 1) * limit).take(limit);

    const [entities, total] = await qb.getManyAndCount();

    // joinedAt của đúng trang này (1 query nhỏ, tránh getRawAndEntities với skip/take + join).
    const ids = entities.map((c) => c.id);
    const joinedAtById = new Map<number, Date | null>();
    if (ids.length > 0) {
      const ms = await this.membershipRepo
        .createQueryBuilder('m')
        .select(['m.customerId', 'm.joinedAt'])
        .where('m.groupId = :groupId', { groupId })
        .andWhere('m.customerId IN (:...ids)', { ids })
        .getMany();
      ms.forEach((m) => joinedAtById.set(m.customerId, m.joinedAt));
    }

    const hiddenKeys = await this.uiVisibilityService.getHiddenElementKeys(
      caller.role,
      'customers',
      caller.departmentId,
      caller.positionId,
      caller.isRootAdmin,
    );

    const data: GroupCustomerRow[] = entities.map((c) => {
      const row: any = {
        id: c.id,
        name: c.name,
        phone: c.phone,
        source: c.source,
        status: c.status,
        inputDate: c.inputDate ?? null,
        createdAt: c.createdAt,
        joinedAt: joinedAtById.get(c.id) ?? null,
        salesUserId: c.salesUser?.id,
        salesUser: c.salesUser ? { id: c.salesUser.id, name: c.salesUser.name } : null,
        marketingUserId: c.marketingUser?.id,
        marketingUser: c.marketingUser ? { id: c.marketingUser.id, name: c.marketingUser.name } : null,
      };
      return this.uiVisibilityService.stripHiddenCustomerFields(row, hiddenKeys);
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
