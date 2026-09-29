import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { UtmManagersService } from './utm-managers.service';
import { UtmCaller } from './utms.service';
import { UtmCustomersQueryDto } from './dto/utm-customers-query.dto';

/**
 * Khách hàng của từng UTM. AN TOÀN DỮ LIỆU: quyền quản lý UTM KHÔNG mở rộng quyền xem khách hàng -
 * số đếm và danh sách luôn bị lọc theo scope `customers.view` của người xem (`CustomerAccessHelper.applyViewFilter`),
 * nên count và danh sách luôn khớp nhau. Khác `LinkGroupCustomersService` (không lọc scope) - đây là chủ ý.
 */
@Injectable()
export class UtmCustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly managersService: UtmManagersService,
    private readonly uiVisibilityService: UiVisibilityService,
  ) {}

  /** `{ [utmId]: số KH trong phạm vi xem }` - 1 truy vấn GROUP BY, không N+1. UTM không có khách -> không có key. */
  async getCounts(caller: UtmCaller, scope: string | null | undefined): Promise<Record<number, number>> {
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .select('customer.utmId', 'utmId')
      .addSelect('COUNT(*)', 'cnt')
      .where('customer.deletedAt IS NULL')
      .andWhere('customer.utmId IS NOT NULL')
      .groupBy('customer.utmId');
    CustomerAccessHelper.applyViewFilter(qb, caller.id, caller.role, scope);

    const rows = await qb.getRawMany();
    const result: Record<number, number> = {};
    rows.forEach((r) => (result[Number(r.utmId)] = Number(r.cnt)));
    return result;
  }

  async listCustomers(utmId: number, query: UtmCustomersQueryDto, caller: UtmCaller, scope: string | null | undefined) {
    // 403/404 nếu không phải thành viên UTM / scope utms.view không phủ tới.
    await this.managersService.getManagers(utmId, caller);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .where('customer.deletedAt IS NULL')
      .andWhere('customer.utmId = :utmId', { utmId });
    CustomerAccessHelper.applyViewFilter(qb, caller.id, caller.role, scope);

    if (query.search?.trim()) {
      qb.andWhere('(customer.name LIKE :kw OR customer.phone LIKE :kw)', { kw: `%${query.search.trim()}%` });
    }
    if (query.status) qb.andWhere('customer.status = :status', { status: query.status });

    qb.orderBy('customer.createdAt', 'DESC')
      .addOrderBy('customer.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [entities, total] = await qb.getManyAndCount();

    const hiddenKeys = await this.uiVisibilityService.getHiddenElementKeys(
      caller.role,
      'customers',
      caller.departmentId,
      caller.positionId,
      caller.isRootAdmin,
    );

    const data = entities.map((c) => {
      const row: Record<string, unknown> = {
        id: c.id,
        name: c.name,
        phone: c.phone,
        source: c.source,
        status: c.status,
        inputDate: c.inputDate ?? null,
        createdAt: c.createdAt,
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
