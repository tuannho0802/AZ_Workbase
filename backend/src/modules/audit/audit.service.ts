import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, Between } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Setting } from '../../database/entities/setting.entity';
import { Customer } from '../../database/entities/customer.entity';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
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
      fromDate,
      toDate,
      search,
    } = filters;

    const qb = this.auditLogRepository
      .createQueryBuilder('log')
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

    if (fromDate) {
      qb.andWhere('log.createdAt >= :fromDate', { fromDate });
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      qb.andWhere('log.createdAt < :toDate', { toDate: end.toISOString() });
    }

    if (search) {
      qb.andWhere('(user.name LIKE :search OR customer.name LIKE :search)', { search: `%${search}%` });
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