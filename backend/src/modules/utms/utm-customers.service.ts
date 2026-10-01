import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionsService } from '../permissions/permissions.service';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { UtmManagersService } from './utm-managers.service';
import { UtmCaller } from './utms.service';
import { UtmCustomersQueryDto } from './dto/utm-customers-query.dto';

/** Bộ lọc đã được UtmStatsService chuẩn hoá (khoảng ngày hợp lệ, UTM đã lọc theo scope utms.view). */
export interface UtmStatsCustomersFilter {
  from: string;
  to: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

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
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Permission nhị phân (không scope) - cùng quy tắc `UtmsService.hasBinary` (Root Admin luôn được). */
  private async hasBinary(caller: UtmCaller, key: string): Promise<boolean> {
    if (caller.role === Role.ADMIN && caller.isRootAdmin) return true;
    const { allowed } = await this.permissionsService.hasPermission(
      caller.role,
      key,
      caller.departmentId,
      caller.positionId,
    );
    return allowed;
  }

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

    // Khách trong Thùng rác chỉ hiện cho người có `customers.trash_manage` (cùng cổng với trang Thùng rác) và VẪN
    // bị lọc theo scope `customers.view` - quản lý UTM không mở rộng quyền xem khách.
    const trashed = query.trashed ?? 'exclude';
    if (trashed !== 'exclude' && !(await this.hasBinary(caller, 'customers.trash_manage'))) {
      throw new ForbiddenException('Bạn không có quyền xem khách hàng trong Thùng rác');
    }
    const deletedClause = {
      exclude: 'customer.deletedAt IS NULL',
      only: 'customer.deletedAt IS NOT NULL',
      include: '1 = 1',
    }[trashed];

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .where(deletedClause)
      .andWhere('customer.utmId = :utmId', { utmId });
    // Mặc định TypeORM tự thêm `deleted_at IS NULL` - phải withDeleted() thì mới thấy dòng Thùng rác.
    if (trashed !== 'exclude') qb.withDeleted();
    CustomerAccessHelper.applyViewFilter(qb, caller.id, caller.role, scope);

    if (query.search?.trim()) {
      qb.andWhere('(customer.name LIKE :kw OR customer.phone LIKE :kw)', { kw: `%${query.search.trim()}%` });
    }
    if (query.status) qb.andWhere('customer.status = :status', { status: query.status });

    qb.orderBy('customer.createdAt', 'DESC')
      .addOrderBy('customer.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);
    const [entities, total] = await qb.getManyAndCount();

    const data = await this.mapRows(entities, caller);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Chuyển entity -> dòng trả về FE, đã strip các field bị ẩn theo UI-visibility của người xem. */
  private async mapRows(entities: Customer[], caller: UtmCaller): Promise<Array<Record<string, unknown>>> {
    const hiddenKeys = await this.uiVisibilityService.getHiddenElementKeys(
      caller.role,
      'customers',
      caller.departmentId,
      caller.positionId,
      caller.isRootAdmin,
    );

    return entities.map((c) => {
      const row: Record<string, unknown> = {
        id: c.id,
        name: c.name,
        phone: c.phone,
        source: c.source,
        status: c.status,
        inputDate: c.inputDate ?? null,
        createdAt: c.createdAt,
        deletedAt: c.deletedAt ?? null,
        utmId: c.utmId ?? null,
        // Chỉ có khi truy vấn có join `customer.utm` (Mini Table của tab Thống kê).
        utm: c.utm ? { id: c.utm.id, name: c.utm.name, color: c.utm.color, isActive: !!c.utm.isActive } : null,
        salesUserId: c.salesUser?.id,
        salesUser: c.salesUser ? { id: c.salesUser.id, name: c.salesUser.name } : null,
        marketingUserId: c.marketingUser?.id,
        marketingUser: c.marketingUser ? { id: c.marketingUser.id, name: c.marketingUser.name } : null,
      };
      return this.uiVisibilityService.stripHiddenCustomerFields(row, hiddenKeys);
    });
  }

  /**
   * Mini Table của tab Thống kê: khách thuộc TẬP UTM (đã lọc theo scope `utms.view` + bộ lọc quản lý/trạng thái UTM
   * bởi `UtmStatsService`) trong khoảng Ngày nhập khách. Luôn lọc theo scope `customers.view` và KHÔNG gồm khách
   * Thùng rác - cùng điều kiện với số liệu chart nên số dòng khớp số trên chart/card.
   * `scope` null (không có customers.view) hoặc tập UTM rỗng -> trả trang rỗng, KHÔNG truy vấn
   * (applyViewFilter với scope rỗng rơi về 'own' chứ không fail-closed).
   */
  async listForUtms(utmIds: number[], filter: UtmStatsCustomersFilter, caller: UtmCaller, scope: string | null | undefined) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    if (!scope || utmIds.length === 0) return { data: [], total: 0, page, limit, totalPages: 0 };

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .leftJoinAndSelect('customer.utm', 'utm')
      .where('customer.deletedAt IS NULL')
      .andWhere('customer.utmId IN (:...utmIds)', { utmIds })
      .andWhere('customer.inputDate >= :from AND customer.inputDate <= :to', { from: filter.from, to: filter.to });
    CustomerAccessHelper.applyViewFilter(qb, caller.id, caller.role, scope);

    if (filter.search?.trim()) {
      qb.andWhere('(customer.name LIKE :kw OR customer.phone LIKE :kw)', { kw: `%${filter.search.trim()}%` });
    }
    if (filter.status) qb.andWhere('customer.status = :status', { status: filter.status });

    qb.orderBy('customer.inputDate', 'DESC')
      .addOrderBy('customer.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);
    const [entities, total] = await qb.getManyAndCount();

    return { data: await this.mapRows(entities, caller), total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
