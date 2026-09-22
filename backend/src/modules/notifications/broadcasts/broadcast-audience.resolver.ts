import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { DepartmentManager } from '../../../database/entities/department-manager.entity';
import { DepartmentManagerHelper } from '../../departments/helpers/department-manager.helper';
import { PermissionScope } from '../../../database/entities/role-permission.entity';
import { BroadcastAudienceDto } from './dto/audience.dto';

export const NOTIFICATION_BROADCAST_MAX_RECIPIENTS = Number(
  process.env.NOTIFICATION_BROADCAST_MAX_RECIPIENTS || 2000,
);

export interface ResolvedAudience {
  userIds: number[];
  /** user active nằm NGOÀI phạm vi audience_params gốc (vd đã đổi phòng ban) */
  excludedCount: number;
}

/**
 * [M1] Resolve đối tượng người gửi CHỌN -> danh sách userId THẬT SỰ được phép
 * gửi, kiểm lại đúng `scope` của `notification_broadcasts.create` mà
 * `PermissionGuard` đã gán (KHÔNG tin `userIds`/`departmentIds` từ client -
 * PLAN nguyên tắc 5, mục 0.14: `/users/all` không lọc scope).
 *
 * Static + nhận repo qua tham số (mirror `UsersAccessHelper`) để dễ test bằng
 * mock repo, không cần dựng cả Nest TestingModule.
 */
export class BroadcastAudienceResolver {
  static async resolve(
    userRepo: Repository<User>,
    audience: BroadcastAudienceDto,
    senderId: number,
    createScope: string | null | undefined,
  ): Promise<ResolvedAudience> {
    // scope 'own' hoặc không có dòng nào (undefined/null) -> không được gửi
    // cho ai khác chính mình -> coi như KHÔNG có quyền gửi thật sự.
    if (createScope !== PermissionScope.ALL && createScope !== PermissionScope.DEPARTMENT) {
      throw new ForbiddenException('Bạn không có quyền gửi thông báo thủ công');
    }

    let candidateIds: number[];

    if (audience.type === 'ALL') {
      if (createScope !== PermissionScope.ALL) {
        throw new ForbiddenException(
          'Chỉ tài khoản có phạm vi gửi "Toàn bộ" mới được chọn đối tượng này',
        );
      }
      const rows = await userRepo.find({
        where: { isActive: true } as any,
        select: { id: true },
      });
      candidateIds = rows.map((r) => r.id);
    } else if (audience.type === 'DEPARTMENTS') {
      const departmentIds = audience.departmentIds ?? [];
      if (createScope === PermissionScope.DEPARTMENT) {
        const departmentManagerRepo = userRepo.manager.getRepository(DepartmentManager);
        const managedIds = await DepartmentManagerHelper.getManagedDepartmentIds(
          departmentManagerRepo,
          senderId,
        );
        const rejected = departmentIds.filter((id) => !managedIds.includes(id));
        if (rejected.length > 0) {
          throw new ForbiddenException(
            `Phòng ban ngoài phạm vi quản lý của bạn: ${rejected.join(', ')}`,
          );
        }
      }
      const rows = await userRepo.find({
        where: { isActive: true, departmentId: departmentIds as any } as any,
        select: { id: true },
      });
      candidateIds = rows.map((r) => r.id);
    } else {
      // USERS
      const requestedIds = Array.from(new Set(audience.userIds ?? []));
      const users = await userRepo.find({
        where: { id: requestedIds as any },
        select: { id: true, isActive: true, departmentId: true },
      });
      const foundIds = new Set(users.map((u) => u.id));
      const notFound = requestedIds.filter((id) => !foundIds.has(id));
      if (notFound.length > 0) {
        throw new ForbiddenException(
          `Người dùng không tồn tại hoặc đã bị khoá: ${notFound.join(', ')}`,
        );
      }

      if (createScope === PermissionScope.DEPARTMENT) {
        const departmentManagerRepo = userRepo.manager.getRepository(DepartmentManager);
        const managedIds = await DepartmentManagerHelper.getManagedDepartmentIds(
          departmentManagerRepo,
          senderId,
        );
        const rejected = users
          .filter((u) => u.departmentId == null || !managedIds.includes(u.departmentId))
          .map((u) => u.id);
        if (rejected.length > 0) {
          throw new ForbiddenException(
            `Người dùng ngoài phạm vi phòng ban bạn quản lý: ${rejected.join(', ')}`,
          );
        }
      }

      candidateIds = users.filter((u) => u.isActive).map((u) => u.id);
    }

    const beforeSenderExclusion = candidateIds.length;
    // Người gửi không tự nhận bản của mình (PLAN 4.5).
    const finalIds = Array.from(new Set(candidateIds)).filter((id) => id !== senderId);
    const excludedCount = beforeSenderExclusion - finalIds.length;

    if (finalIds.length === 0) {
      throw new BadRequestException('Không có người nhận hợp lệ');
    }
    if (finalIds.length > NOTIFICATION_BROADCAST_MAX_RECIPIENTS) {
      throw new BadRequestException(
        `Vượt quá số người nhận tối đa (${NOTIFICATION_BROADCAST_MAX_RECIPIENTS}) cho 1 lần gửi`,
      );
    }

    return { userIds: finalIds, excludedCount };
  }
}
