import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
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
      // Add 1 day to toDate to make it inclusive
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      qb.andWhere('log.createdAt < :toDate', { toDate: end.toISOString() });
    }

    if (search) {
      qb.andWhere('user.name LIKE :search', { search: `%${search}%` });
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
}
