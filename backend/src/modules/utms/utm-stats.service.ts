import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { UtmsService, UtmCaller, UtmScopedBrief } from './utms.service';
import { UtmCustomersService } from './utm-customers.service';
import { UtmStatsCustomersQueryDto, UtmStatsFilterDto, UtmStatsQueryDto } from './dto/utm-stats-query.dto';
import {
  addDays,
  aggregateUtmStats,
  buildBuckets,
  isValidDateStr,
  pickGranularity,
  spanDays,
  UtmStatsAggregate,
  UtmStatsGranularity,
  UtmStatsRawRow,
  UTM_STATS_MAX_SPAN_DAYS,
} from './helpers/utm-stats.helper';

const DEFAULT_SPAN_DAYS = 30;

export interface UtmStatsStatusInfo {
  code: string;
  name: string;
  color: string;
}

export interface UtmStatsResult extends UtmStatsAggregate {
  range: { from: string; to: string; granularity: UtmStatsGranularity };
  /** Scope `utms.view` của người xem (own/department/all) - FE hiện nhãn "phạm vi". */
  utmScope: string;
  /** Scope `customers.view` được áp lên khách; null = không xem được khách nào (số liệu = 0). */
  customerScope: string | null;
  /** Số UTM được thống kê (= tất cả UTM trong phạm vi, hoặc 1 nếu có lọc `utmId`). */
  utmCount: number;
  statuses: UtmStatsStatusInfo[];
  /** Toàn bộ UTM trong phạm vi utms.view (kèm Quản lý chính/phụ) - FE dựng dropdown lọc từ đây. */
  utms: UtmScopedBrief[];
}

/**
 * Tab "Thống kê" trang Quản lý UTM. HAI lớp phạm vi, cả hai đều bắt buộc:
 *  1) UTM nào được thống kê = scope `utms.view` (own = mình là chính/phụ, department = Quản lý chính thuộc phòng ban
 *     mình quản lý, all = tất cả) - CÙNG helper với tab "Tất cả UTM" (`UtmsService.scopedUtmBriefs`).
 *  2) Khách nào được đếm = scope `customers.view` (`CustomerAccessHelper.applyViewFilter`) - quản lý UTM KHÔNG
 *     mở rộng quyền xem khách hàng (PLAN_UTM 6.2), nên số ở đây luôn khớp với danh sách khách trong modal UTM.
 */
@Injectable()
export class UtmStatsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerStatus)
    private readonly statusRepo: Repository<CustomerStatus>,
    private readonly utmsService: UtmsService,
    private readonly customersService: UtmCustomersService,
  ) {}

  private resolveRange(query: UtmStatsQueryDto): { from: string; to: string } {
    const to = query.to ?? todayVnStr();
    const from = query.from ?? addDays(to, -(DEFAULT_SPAN_DAYS - 1));
    if (!isValidDateStr(from) || !isValidDateStr(to)) throw new BadRequestException('Ngày không hợp lệ');
    if (from > to) throw new BadRequestException('"Từ ngày" phải trước hoặc bằng "Đến ngày"');
    if (spanDays(from, to) > UTM_STATS_MAX_SPAN_DAYS) {
      throw new BadRequestException(`Khoảng thời gian tối đa ${UTM_STATS_MAX_SPAN_DAYS} ngày`);
    }
    return { from, to };
  }

  /**
   * Tập UTM sau khi áp phạm vi `utms.view` rồi tới các bộ lọc nhanh (UTM cụ thể / Quản lý chính / Quản lý phụ).
   * Dùng CHUNG cho chart và Mini Table khách để hai nơi luôn khớp nhau. Các bộ lọc chỉ THU HẸP tập trong phạm vi -
   * không bao giờ mở rộng ra UTM ngoài quyền xem.
   */
  private async resolveUtms(caller: UtmCaller, query: UtmStatsFilterDto) {
    const [utmScope, customerScope, allBriefs] = await Promise.all([
      this.utmsService.scopeOf(caller, 'utms.view'),
      this.utmsService.scopeOf(caller, 'customers.view'),
      this.utmsService.scopedUtmBriefs(caller),
    ]);
    // Guard cứng (fail-closed): endpoint đã có @RequirePermission('utms.view') nhưng vẫn không tin scope rỗng.
    if (!utmScope) throw new ForbiddenException('Bạn không có quyền xem thống kê UTM');

    let briefs = allBriefs;
    if (query.utmId != null) {
      briefs = allBriefs.filter((u) => u.id === query.utmId);
      if (briefs.length === 0) throw new ForbiddenException('UTM không nằm trong phạm vi của bạn');
    }
    // utmIds: ID ngoài phạm vi bị bỏ qua (không 403 - dropdown FE có thể còn ID cũ sau khi UTM bị xoá/đổi quyền).
    if (query.utmIds && query.utmIds.length > 0) {
      const wanted = new Set(query.utmIds);
      briefs = briefs.filter((u) => wanted.has(u.id));
    }
    if (query.primaryManagerId != null) {
      briefs = briefs.filter((u) => u.primaryManager?.id === query.primaryManagerId);
    }
    if (query.secondaryManagerId != null) {
      briefs = briefs.filter((u) => u.secondaryManagers.some((m) => m.id === query.secondaryManagerId));
    }
    return { utmScope, customerScope, allBriefs, briefs };
  }

  async getStats(caller: UtmCaller, query: UtmStatsQueryDto): Promise<UtmStatsResult> {
    const { from, to } = this.resolveRange(query);
    const granularity = pickGranularity(from, to);
    const buckets = buildBuckets(from, to, granularity);

    const [{ utmScope, customerScope, allBriefs, briefs }, statusRows] = await Promise.all([
      this.resolveUtms(caller, query),
      this.statusRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
    ]);

    const statuses: UtmStatsStatusInfo[] = statusRows.map((s) => ({ code: s.code, name: s.name, color: s.color }));
    const statusCodes = statuses.map((s) => s.code);

    let rows: UtmStatsRawRow[] = [];
    // customerScope null (không có customers.view) hoặc không có UTM nào -> KHÔNG truy vấn: applyViewFilter với
    // scope rỗng sẽ rơi về 'own' chứ không fail-closed.
    if (customerScope && briefs.length > 0) {
      const qb = this.customerRepo
        .createQueryBuilder('customer')
        .select("DATE_FORMAT(customer.inputDate, '%Y-%m-%d')", 'date')
        .addSelect('customer.utmId', 'utmId')
        .addSelect('customer.status', 'status')
        .addSelect('COUNT(*)', 'cnt')
        .where('customer.deletedAt IS NULL')
        .andWhere('customer.utmId IN (:...utmIds)', { utmIds: briefs.map((u) => u.id) })
        .andWhere('customer.inputDate >= :from AND customer.inputDate <= :to', { from, to })
        .groupBy('customer.inputDate')
        .addGroupBy('customer.utmId')
        .addGroupBy('customer.status');
      CustomerAccessHelper.applyViewFilter(qb, caller.id, caller.role, customerScope);

      const raw = await qb.getRawMany();
      rows = raw.map((r) => ({
        date: String(r.date),
        utmId: Number(r.utmId),
        status: String(r.status),
        cnt: Number(r.cnt),
      }));
    }

    const agg = aggregateUtmStats(rows, statusCodes, buckets, granularity);
    // Status lạ (mồ côi) hiện bằng chính mã, màu trung tính.
    const extra = agg.statusCodes
      .filter((c) => !statusCodes.includes(c))
      .map((c) => ({ code: c, name: c, color: '#8c8c8c' }));

    return {
      range: { from, to, granularity },
      utmScope,
      customerScope: customerScope ?? null,
      utmCount: briefs.length,
      statuses: [...statuses, ...extra],
      // Luôn trả ĐỦ UTM trong phạm vi (không phải chỉ UTM đang lọc) để dropdown lọc ở FE không "co lại" thành 1 mục.
      utms: allBriefs,
      totals: agg.totals,
      series: agg.series,
      byUtm: agg.byUtm,
    };
  }

  /**
   * Mini Table khách khi bấm vào chart/card: cùng bộ lọc với `getStats` + `status`/`search`/phân trang.
   * Số dòng khớp số trên chart vì dùng chung `resolveUtms` và điều kiện khách (Ngày nhập, không Thùng rác, scope
   * `customers.view`).
   */
  async listCustomers(caller: UtmCaller, query: UtmStatsCustomersQueryDto) {
    const { from, to } = this.resolveRange(query);
    const { customerScope, briefs } = await this.resolveUtms(caller, query);
    return this.customersService.listForUtms(
      briefs.map((u) => u.id),
      { from, to, status: query.status, search: query.search, page: query.page, limit: query.limit },
      caller,
      customerScope,
    );
  }
}
