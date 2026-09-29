import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Utm } from '../../database/entities/utm.entity';
import { UtmSecondaryManager } from '../../database/entities/utm-secondary-manager.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { UtmAccessHelper } from './helpers/utm-access.helper';
import { UtmsService, UtmCaller } from './utms.service';

export interface UtmManagersResult {
  utmId: number;
  utmName: string;
  primaryManager: { id: number; name: string; email: string; role: string } | null;
  secondaryManagers: Array<{ id: number; name: string; email: string; role: string; addedAt: Date }>;
  /** Người gọi có được thêm/gỡ Quản lý phụ + chuyển chính không (FE dùng để ẩn/hiện nút). */
  canEdit: boolean;
}

/**
 * Quản lý chính/phụ của từng UTM (mirror LinkGroupManagersService). Khác Nhóm liên kết: quyền rộng
 * KHÔNG còn là 1 permission `manage` riêng mà là SCOPE của `utms.assign` (Root Admin luôn 'all').
 * Chỉ Quản lý chính hoặc người có scope phủ tới UTM mới thêm/gỡ phụ và chuyển chính.
 */
@Injectable()
export class UtmManagersService {
  constructor(
    @InjectRepository(Utm) private readonly utmRepo: Repository<Utm>,
    @InjectRepository(UtmSecondaryManager) private readonly secondaryRepo: Repository<UtmSecondaryManager>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly utmsService: UtmsService,
    private readonly auditService: AuditService,
  ) {}

  private memberPayload(utm: Utm, target: { name?: string; email?: string } | null | undefined, userId: number, memberRole: string) {
    return {
      utmId: utm.id,
      utmName: utm.name,
      userId,
      userName: target?.name ?? null,
      userEmail: target?.email ?? null,
      memberRole,
    };
  }

  private async assignRelation(utm: Utm, user: UtmCaller) {
    const [scope, managed] = await Promise.all([
      this.utmsService.scopeOf(user, 'utms.assign'),
      this.utmsService.managedDepartmentIds(user.id),
    ]);
    return UtmAccessHelper.relation(scope, this.utmsService.buildContext(utm, user.id, managed));
  }

  private async toResult(utm: Utm, user: UtmCaller): Promise<UtmManagersResult> {
    const canEdit = UtmAccessHelper.canEditSecondaryManagers(await this.assignRelation(utm, user));
    return {
      utmId: utm.id,
      utmName: utm.name,
      primaryManager: utm.primaryManager
        ? {
            id: utm.primaryManager.id,
            name: utm.primaryManager.name,
            email: utm.primaryManager.email,
            role: utm.primaryManager.role,
          }
        : null,
      secondaryManagers: (utm.secondaryManagers ?? [])
        .filter((m) => m.user)
        .map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role, addedAt: m.createdAt })),
      canEdit,
    };
  }

  /** Xem chính/phụ: thành viên của UTM hoặc scope `utms.view` phủ tới (all/department). */
  async getManagers(utmId: number, user: UtmCaller): Promise<UtmManagersResult> {
    const utm = await this.utmsService.loadUtm(utmId);
    const [viewScope, managed] = await Promise.all([
      this.utmsService.scopeOf(user, 'utms.view'),
      this.utmsService.managedDepartmentIds(user.id),
    ]);
    const ctx = this.utmsService.buildContext(utm, user.id, managed);
    const isMember = ctx.primaryManagerId === user.id || ctx.secondaryManagerUserIds.includes(user.id);
    if (!UtmAccessHelper.canViewManagers(isMember, UtmAccessHelper.relation(viewScope, ctx))) {
      throw new ForbiddenException('Bạn không phải Quản lý chính/phụ của UTM này nên không có quyền xem');
    }
    return this.toResult(utm, user);
  }

  async addSecondaryManager(utmId: number, userId: number, user: UtmCaller): Promise<UtmManagersResult> {
    const utm = await this.utmsService.loadUtm(utmId);
    if (!UtmAccessHelper.canEditSecondaryManagers(await this.assignRelation(utm, user))) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc người có quyền rộng) mới được thêm Quản lý phụ cho UTM này');
    }
    if (utm.primaryManagerId === userId) {
      throw new BadRequestException('Người này đang là Quản lý chính của UTM — không thể vừa là chính vừa là phụ');
    }
    if ((utm.secondaryManagers ?? []).some((m) => m.userId === userId)) {
      throw new ConflictException('Người này đã là Quản lý phụ của UTM rồi');
    }
    const target = await this.userRepo.findOneBy({ id: userId, isActive: true });
    if (!target) throw new BadRequestException(`Nhân viên ID ${userId} không tồn tại hoặc đã bị khóa`);

    try {
      await this.secondaryRepo.save(this.secondaryRepo.create({ utmId, userId, addedById: user.id }));
    } catch (err: any) {
      // Thêm đồng thời cùng 1 người -> UNIQUE(utm_id,user_id) bắt được.
      if (err?.code === 'ER_DUP_ENTRY' || err?.driverError?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Người này đã là Quản lý phụ của UTM rồi');
      }
      throw err;
    }

    this.auditService.logActionAsync(
      user.id,
      'ADD_UTM_MANAGER',
      'utm',
      utmId,
      null,
      this.memberPayload(utm, target, userId, 'secondary_manager'),
    );
    return this.toResult(await this.utmsService.loadUtm(utmId), user);
  }

  async removeSecondaryManager(utmId: number, userId: number, user: UtmCaller): Promise<UtmManagersResult> {
    const utm = await this.utmsService.loadUtm(utmId);
    if (!UtmAccessHelper.canEditSecondaryManagers(await this.assignRelation(utm, user))) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc người có quyền rộng) mới được gỡ Quản lý phụ của UTM này');
    }
    const existing = (utm.secondaryManagers ?? []).find((m) => m.userId === userId);
    if (!existing) throw new NotFoundException('Người này không phải Quản lý phụ của UTM — không có gì để gỡ');

    // Dựng payload TRƯỚC remove() vì TypeORM xoá `id` khỏi entity sau khi xoá.
    const removed = this.memberPayload(utm, existing.user, userId, 'secondary_manager');
    await this.secondaryRepo.remove(existing);

    this.auditService.logActionAsync(user.id, 'REMOVE_UTM_MANAGER', 'utm', utmId, removed, null);
    return this.toResult(await this.utmsService.loadUtm(utmId), user);
  }

  /**
   * Chuyển Quản lý chính. Người mới đang là phụ thì tự gỡ khỏi bảng phụ (tránh vừa chính vừa phụ).
   * Quản lý chính cũ KHÔNG tự thành phụ (chủ dự án muốn thì thêm lại thủ công).
   */
  async transferPrimary(utmId: number, userId: number, user: UtmCaller): Promise<UtmManagersResult> {
    const utm = await this.utmsService.loadUtm(utmId);
    if (!UtmAccessHelper.canEditSecondaryManagers(await this.assignRelation(utm, user))) {
      throw new ForbiddenException('Chỉ Quản lý chính (hoặc người có quyền rộng) mới được chuyển quyền Quản lý chính');
    }
    if (utm.primaryManagerId === userId) {
      throw new BadRequestException('Người này đã là Quản lý chính của UTM');
    }
    const target = await this.userRepo.findOneBy({ id: userId, isActive: true });
    if (!target) throw new BadRequestException(`Nhân viên ID ${userId} không tồn tại hoặc đã bị khóa`);

    const oldPrimary = utm.primaryManager;
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UtmSecondaryManager, { utmId, userId });
      await manager.update(Utm, utmId, { primaryManagerId: userId });
    });

    this.auditService.logActionAsync(
      user.id,
      'TRANSFER_UTM_OWNER',
      'utm',
      utmId,
      { utmId, utmName: utm.name, primaryManagerId: oldPrimary?.id ?? null, primaryManagerName: oldPrimary?.name ?? null },
      { utmId, utmName: utm.name, primaryManagerId: userId, primaryManagerName: target.name },
    );
    return this.toResult(await this.utmsService.loadUtm(utmId), user);
  }
}
