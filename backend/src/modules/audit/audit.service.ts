import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, Between } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Setting } from '../../database/entities/setting.entity';
import { Customer } from '../../database/entities/customer.entity';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

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
      const enabled = await this.settingRepository.findOne({ where: { key: 'audit_cleanup_enabled' } });
      const retentionDays = await this.settingRepository.findOne({ where: { key: 'audit_retention_days' } });

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
    await this.settingRepository.save({ key: 'audit_cleanup_enabled', value: String(enabled) });
    await this.settingRepository.save({ key: 'audit_retention_days', value: String(retentionDays) });

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
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
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
