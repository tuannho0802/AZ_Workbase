import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, Between } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Setting } from '../../database/entities/setting.entity';
import { Customer } from '../../database/entities/customer.entity';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { paginateByWeek, weekStartColumnRef } from '../../common/utils/week-window.util';
// ⚠️ KHÔNG dùng @nestjs/schedule - app chạy trên Vercel serverless, không có
// process nào sống đủ lâu để cron tự kích hoạt. handleCleanupCron() bên dưới
// vẫn giữ lại nhưng chỉ gọi được thủ công (qua 1 endpoint admin sau này),
// không tự chạy.

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
  ) {}

  async logAction(
    userId: number,
    action: string,
    entityType: string,
    entityId: number,
    oldData?: any,
    newData?: any,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const auditLog = this.auditLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      oldData,
      newData,
      ipAddress,
      userAgent,
    });
    return await this.auditLogRepository.save(auditLog);
  }

  /**
   * YÊU CẦU NGƯỜI DÙNG: fallback tự động cho cột "Người xóa" ở Thùng rác
   * khách hàng - các bản ghi bị xóa mềm TRƯỚC KHI migration
   * `AddDeletedByToCustomers` chạy sẽ có `deleted_by_id = NULL` (cột mới
   * thêm, không hồi tố được dữ liệu cũ trực tiếp). Thay vì hiện "—" vĩnh
   * viễn cho các bản ghi cũ đó, dò lại `audit_logs` (đã ghi từ trước, có
   * `user_id` của người bấm xóa) để suy ra ai đã xóa.
   *
   * Tra cứu THEO BATCH (1 query cho N entityId, không N+1) - trả về
   * `Map<entityId, userId>` ứng với bản ghi audit MỚI NHẤT khớp
   * action+entityType cho từng entityId. Dùng
   * `ORDER BY entity_id, created_at DESC` + lấy dòng đầu tiên gặp cho mỗi
   * entityId (tương đương `ROW_NUMBER() OVER (PARTITION BY ...)`) để tương
   * thích cả MySQL 5.7 (chưa có window function) lẫn 8.0.
   */
  async findLastActorsForEntities(
    entityType: string,
    entityIds: number[],
    action: string,
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (entityIds.length === 0) return result;

    const rows = await this.auditLogRepository
      .createQueryBuilder('log')
      .select('log.entityId', 'entityId')
      .addSelect('log.userId', 'userId')
      .addSelect('log.createdAt', 'createdAt')
      .where('log.entityType = :entityType', { entityType })
      .andWhere('log.action = :action', { action })
      .andWhere('log.entityId IN (:...entityIds)', { entityIds })
      .orderBy('log.entityId', 'ASC')
      .addOrderBy('log.createdAt', 'DESC')
      .getRawMany<{ entityId: number | string; userId: number | string }>();

    for (const row of rows) {
      const entityId = Number(row.entityId);
      // Đã sắp `createdAt DESC` trong từng nhóm entityId -> dòng ĐẦU TIÊN
      // gặp cho 1 entityId chính là bản ghi audit mới nhất, các dòng sau
      // (cũ hơn) bỏ qua.
      if (!result.has(entityId)) {
        result.set(entityId, Number(row.userId));
      }
    }
    return result;
  }

  /**
   * Ghi audit log dạng "fire-and-forget": KHÔNG chặn response chính.
   * Dùng waitUntil() của Vercel (@vercel/functions) thay vì bỏ await "tay
   * không" — waitUntil() đảm bảo Vercel giữ function sống đủ lâu để tác vụ
   * này chạy xong trước khi tắt, trong khi vẫn trả response cho client ngay
   * lập tức, không cần chờ ghi log.
   *
   * Đánh đổi: nếu ghi log thất bại (hiếm), sẽ KHÔNG tự động retry (khác với
   * hàng đợi thật như BullMQ/QStash) — chỉ log lỗi ra console để theo dõi,
   * và không làm fail request chính đã trả về rồi.
   *
   * Dùng hàm này ở các call site ghi audit log cho các thao tác CRUD thông
   * thường (create/update/delete...). Với các trường hợp CẦN đảm bảo log đã
   * ghi xong trước khi trả kết quả (nếu có), vẫn dùng `await logAction(...)`.
   */
  logActionAsync(
    userId: number,
    action: string,
    entityType: string,
    entityId: number,
    oldData?: any,
    newData?: any,
    ipAddress?: string,
    userAgent?: string,
  ): void {
    const task = this.logAction(
      userId,
      action,
      entityType,
      entityId,
      oldData,
      newData,
      ipAddress,
      userAgent,
    ).catch((error: any) => {
      this.logger.error(
        `Ghi audit log thất bại (action=${action}, entityType=${entityType}, entityId=${entityId}): ${error?.message}`,
        error?.stack,
      );
    });

    waitUntil(task);
  }

  async getLogs(filters: GetAuditLogsDto) {
    const {
      page = 1,
      limit = 20,
      userId,
      action,
      entityType,
      excludeEntityType,
      fromDate,
      toDate,
      customerSearch,
      weeksPerPage,
      weekStart,
      weekPage,
      weekLimit,
    } = filters;

    const qb = this.auditLogRepository
      .createQueryBuilder('log')
      // ⚠️ Chọn cột tường minh (KHÔNG lấy `log.oldData`/`log.newData`) cho
      // danh sách - 2 cột JSON này có thể rất nặng, không cần cho bảng/list,
      // chỉ tải khi người dùng thực sự mở 1 dòng cụ thể (xem `getLogDetail()`
      // + `GET /audit-logs/:id`). PHẢI đặt TRƯỚC các `leftJoinAndSelect`/
      // `leftJoinAndMapOne` bên dưới - chúng dùng `addSelect` (cộng dồn),
      // không ghi đè `.select()` này.
      .select([
        'log.id',
        'log.userId',
        'log.action',
        'log.entityType',
        'log.entityId',
        'log.ipAddress',
        'log.userAgent',
        'log.createdAt',
      ])
      .leftJoinAndSelect('log.user', 'user')
      // Join with Customer to get the name, including soft-deleted ones
      .leftJoinAndMapOne(
        'log.targetCustomer',
        Customer,
        'customer',
        'log.entityType = :customerType AND log.entityId = customer.id',
        { customerType: 'customer' }
      )
      .orderBy('log.createdAt', 'DESC');

    if (userId) {
      qb.andWhere('log.userId = :userId', { userId });
    }

    if (action) {
      qb.andWhere('log.action = :action', { action });
    }

    if (entityType) {
      qb.andWhere('log.entityType = :entityType', { entityType });
    }

    // Dùng cho tab "Danh sách nhật ký" chính: ẩn log đăng nhập (entityType
    // 'auth') để tránh nhiễu, log đăng nhập xem riêng ở tab "Đăng nhập".
    // Không dùng chung điều kiện với `entityType` ở trên vì 2 tham số này
    // luôn loại trừ nhau theo cách FE gọi (tab chính gửi excludeEntityType,
    // tab Đăng nhập gửi entityType=auth) - nhưng vẫn cho phép kết hợp nếu
    // sau này cần (VD: loại trừ nhiều hơn 1 loại).
    if (excludeEntityType) {
      qb.andWhere('log.entityType != :excludeEntityType', { excludeEntityType });
    }

    if (fromDate) {
      qb.andWhere('log.createdAt >= :fromDate', { fromDate });
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      qb.andWhere('log.createdAt < :toDate', { toDate: end.toISOString() });
    }

    // ⚠️ FE giờ tách 2 ô riêng: "Người thực hiện" dùng `userId` (lọc chính
    // xác qua dropdown, xem `SalesUserSelect`), chỉ còn ô này để tìm theo
    // TÊN KHÁCH HÀNG (đối tượng bị tác động) - không còn OR với user.name
    // như bản cũ.
    if (customerSearch) {
      qb.andWhere('customer.name LIKE :customerSearch', { customerSearch: `%${customerSearch}%` });
    }

    // ⚠️ WEEK-MODE (FE gom Collapse theo tuần): phân trang theo N TUẦN thay vì N
    // bản ghi - xem `week-window.util.ts`. Đặt SAU khi đã áp đủ filter ở trên.
    if (weeksPerPage) {
      const r = await paginateByWeek(qb, {
        weekExpr: weekStartColumnRef('log'),
        page,
        weeksPerPage,
        weekStart,
        weekPage,
        weekLimit,
      });
      return {
        data: r.data,
        total: r.total,
        page,
        limit: weeksPerPage,
        totalPages: r.totalPages,
        weeks: r.weeks,
        weekTotal: r.weekTotal,
        ...r.meta,
      };
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Chi tiết 1 dòng nhật ký, KÈM `oldData`/`newData` (2 cột JSON đã bị loại
   * khỏi `getLogs()` danh sách - xem comment `.select()` ở đó). Dùng cho
   * Drawer/expand-row ở FE khi người dùng thực sự mở 1 dòng cụ thể, thay vì
   * tải sẵn 2 cột nặng này cho MỌI dòng của cả trang.
   */
  async getLogDetail(id: number): Promise<AuditLog | null> {
    return this.auditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .leftJoinAndMapOne(
        'log.targetCustomer',
        Customer,
        'customer',
        'log.entityType = :customerType AND log.entityId = customer.id',
        { customerType: 'customer' },
      )
      .where('log.id = :id', { id })
      .getOne();
  }

  async getDistinctActions(): Promise<string[]> {
    const results = await this.auditLogRepository
      .createQueryBuilder('log')
      .select('DISTINCT log.action', 'action')
      .getRawMany();
    return results.map(r => r.action);
  }

  // Cleanup Settings
  async getCleanupSettings() {
    try {
      // Trước đây 2 query chạy tuần tự (chờ query 1 xong mới bắt đầu query 2)
      // dù không phụ thuộc nhau -> chạy song song để giảm ~50% thời gian chờ.
      const [enabled, retentionDays] = await Promise.all([
        this.settingRepository.findOne({ where: { key: 'audit_cleanup_enabled' } }),
        this.settingRepository.findOne({ where: { key: 'audit_retention_days' } }),
      ]);

      return {
        enabled: enabled?.value === 'true',
        retentionDays: retentionDays ? parseInt(retentionDays.value) : 90,
      };
    } catch (error) {
      // If table doesnt exist or other DB error, return defaults to avoid 500 error
      return {
        enabled: false,
        retentionDays: 90,
      };
    }
  }

  async updateCleanupSettings(enabled: boolean, retentionDays: number, adminId: number) {
    // 2 dòng setting độc lập nhau (key khác nhau) -> ghi song song thay vì tuần tự.
    await Promise.all([
      this.settingRepository.save({ key: 'audit_cleanup_enabled', value: String(enabled) }),
      this.settingRepository.save({ key: 'audit_retention_days', value: String(retentionDays) }),
    ]);

    await this.logAction(adminId, 'UPDATE_AUDIT_SETTINGS', 'setting', 0, null, { enabled, retentionDays });
    return { success: true };
  }

  // Manual Cleanup
  async cleanupByDateRange(from: string, to: string, adminId: number) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1); // Inclusive

    const count = await this.auditLogRepository.count({
      where: { createdAt: Between(fromDate, toDate) }
    });

    await this.auditLogRepository.delete({
      createdAt: Between(fromDate, toDate)
    });

    await this.logAction(adminId, 'ADMIN_CLEANUP_AUDIT_LOGS', 'audit_log', 0, { from, to, count }, null);
    return { success: true, count };
  }

  async bulkDelete(ids: number[], adminId: number) {
    await this.auditLogRepository.delete({ id: In(ids) });
    await this.logAction(adminId, 'ADMIN_BULK_DELETE_AUDIT_LOGS', 'audit_log', 0, { ids }, null);
    return { success: true };
  }

  // Automation
  // @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanupCron() {
    const settings = await this.getCleanupSettings();
    if (!settings.enabled) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.retentionDays);

    const result = await this.auditLogRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    this.logger.log(`[Audit Cleanup] Deleted ${result.affected} logs older than ${settings.retentionDays} days.`);
  }
}