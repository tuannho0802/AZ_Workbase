import { Injectable, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In, Brackets } from 'typeorm';
import { LeaveRequest, LeaveStatus, LeaveDuration } from '../../database/entities/leave-request.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { UploadsService } from '../uploads/uploads.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';

/**
 * PERMISSIONS.md mục 2.6 - ĐÃ ĐƯỢC GENERALIZE sang scope-based:
 *
 * Trước đây dùng bảng ELIGIBLE_APPROVER_ROLES cứng (4 role hệ thống). Giờ:
 * - Ai có permission `leave_requests.approve` với scope='all' -> duyệt được mọi đơn.
 * - Ai có permission `leave_requests.approve` với scope='department' -> chỉ duyệt
 *   đơn của nhân viên trong phòng ban mà họ là manager_user_id.
 * - Không có permission hoặc scope=null -> không duyệt được.
 *
 * Lối thoát hiểm: Role.ADMIN luôn bypass tuyệt đối (khớp với PermissionGuard).
 */
@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,
    
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,

    @InjectRepository(LeaveRequestAttachment)
    private attachmentRepo: Repository<LeaveRequestAttachment>,

    private readonly uploadsService: UploadsService,
    // Đọc động isPaid/deductsAnnualBalance theo leaveType.code - thay hoàn
    // toàn so sánh cứng `leaveType === LeaveType.ANNUAL/SICK` cũ (giờ
    // leave_type là VARCHAR tự do, xem CreateLeaveTypes1781500000000).
    private readonly leaveTypesService: LeaveTypesService,
  ) {}

  /**
   * Kiểm tra `approverId` (role `approverRole`, scope `scope`) có được phép
   * duyệt/từ chối đơn của người thuộc `requesterDepartmentId` hay không.
   * Dùng chung cho cả approve() lẫn reject() (1 nguồn duy nhất).
   *
   * Thay thế hoàn toàn ELIGIBLE_APPROVER_ROLES cứng cũ:
   * - scope='all' hoặc Role.ADMIN -> duyệt mọi đơn.
   * - scope='department' -> duyệt được nếu THOẢ 1 TRONG 2:
   *     (a) approver là managerUserId của phòng ban mà người xin nghỉ thuộc
   *         về (dùng department.managerUserId) - rule mặc định, ÁP DỤNG
   *         CHO MỌI ROLE người xin nghỉ kể cả Assistant nếu cùng phòng ban;
   *     (b) approver chính là `requesterLeaveApproverId` - NGOẠI LỆ gán tay
   *         (xem migration AddLeaveApproverOverrideToUsers1781700000000),
   *         dùng cho case người xin nghỉ KHÔNG cùng phòng ban với Manager
   *         nhưng về tổ chức vẫn phải báo cáo Manager đó.
   * - scope khác (null/own/undefined) -> không được duyệt.
   */
  private async isEligibleApprover(
    requesterDepartmentId: number | null,
    approverId: number,
    approverRole: string,
    scope?: string | null,
    requesterLeaveApproverId?: number | null,
  ): Promise<boolean> {
    // Lối thoát hiểm tuyệt đối cho admin - không bao giờ bị khoá dù cấu hình sai
    if (approverRole === Role.ADMIN || scope === PermissionScope.ALL) {
      return true;
    }

    // scope='department' → managerUserId của đúng phòng ban người xin nghỉ,
    // HOẶC ngoại lệ leave_approver_id gán riêng cho người xin nghỉ đó.
    if (scope === PermissionScope.DEPARTMENT) {
      if (requesterLeaveApproverId != null && requesterLeaveApproverId === approverId) {
        return true;
      }
      if (requesterDepartmentId == null) return false;
      const dept = await this.departmentRepo.findOne({
        where: { id: requesterDepartmentId, managerUserId: approverId },
      });
      return !!dept;
    }

    // scope=null/own hoặc bất kỳ giá trị khác → không được duyệt
    return false;
  }

  /**
   * Danh sách id phòng ban mà `managerId` đang là `manager_user_id` - dùng
   * để lọc findPending()/findHistory() khi viewer là Manager.
   */
  private async getManagedDepartmentIds(managerId: number): Promise<number[]> {
    const depts = await this.departmentRepo.find({
      where: { managerUserId: managerId },
      select: ['id'],
    });
    return depts.map((d) => d.id);
  }
  
  /**
   * Create new leave request
   * Validation: Balance check + Conflict check
   */
  async create(dto: any, requesterId: number) {
    // 0. Validate leaveType tồn tại trong `leave_types` - cột leave_type giờ
    // VARCHAR tự do (không còn ENUM tự chặn ở tầng DB như trước), PHẢI
    // validate ở đây trước khi tạo đơn.
    const leaveType = await this.leaveTypesService.assertExists(dto.leaveType);

    // 1. Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    
    if (startDate > endDate) {
      throw new BadRequestException('Ngày bắt đầu không được sau ngày kết thúc');
    }
    
    // 2. Calculate total days
    const totalDays = this.calculateDays(startDate, endDate, dto.duration);
    
    // 3. Check conflict (no overlapping approved/pending requests)
    const conflict = await this.leaveRequestRepo.findOne({
      where: {
        requesterId,
        status: Not(In([LeaveStatus.REJECTED, LeaveStatus.CANCELLED])),
        startDate: Between(startDate, endDate)
      }
    });
    
    if (conflict) {
      throw new BadRequestException(
        `Bạn đã có đơn nghỉ trong khoảng thời gian này (ID: ${conflict.id})`
      );
    }
    
    // 4. Check balance (loại phép có deductsAnnualBalance=true, mặc định
    // đúng 2 code cũ 'annual'/'sick' - xem seed CreateLeaveTypes1781500000000)
    if (leaveType.deductsAnnualBalance) {
      const user = await this.userRepo.findOne({ where: { id: requesterId } });
      
      if (!user) {
        throw new NotFoundException('User not found');
      }
      
      if (user.annualLeaveBalance < totalDays) {
        throw new BadRequestException(
          `Không đủ phép năm. Còn lại: ${user.annualLeaveBalance} ngày, cần: ${totalDays} ngày`
        );
      }
    }
    
    // 5. Validate + lưu ảnh đính kèm (nếu có) - dto.attachmentKeys là mảng
    // object key đã PUT thẳng lên B2 qua POST /leave-requests/attachments/presign
    const attachmentKeys: string[] = Array.isArray(dto.attachmentKeys) ? dto.attachmentKeys : [];
    if (attachmentKeys.length > 0) {
      const limits = await this.uploadsService.getLimits();
      if (attachmentKeys.length > limits.leaveAttachmentMaxCount) {
        throw new BadRequestException(
          `Tối đa ${limits.leaveAttachmentMaxCount} ảnh đính kèm / đơn`,
        );
      }
      // Kiểm tra dung lượng thật từng ảnh trên B2 - làm TUẦN TỰ (không
      // Promise.all) để dừng ngay + xoá đúng ảnh vi phạm khi gặp lỗi đầu
      // tiên, tránh xoá nhầm/rối trạng thái khi nhiều ảnh cùng lỗi song song.
      for (const key of attachmentKeys) {
        await this.uploadsService.assertUploadedSizeWithinLimit(
          this.uploadsService.leaveAttachmentsBucket,
          key,
          limits.leaveAttachmentMaxSizeKb,
        );
      }
    }

    // 6. Create request
    const leaveRequest = this.leaveRequestRepo.create({
      requesterId,
      leaveType: dto.leaveType,
      startDate,
      endDate,
      duration: dto.duration,
      totalDays,
      reason: dto.reason,
      status: LeaveStatus.PENDING
    });

    const saved = await this.leaveRequestRepo.save(leaveRequest);

    if (attachmentKeys.length > 0) {
      const rows = attachmentKeys.map((objectKey) =>
        this.attachmentRepo.create({ leaveRequestId: saved.id, objectKey }),
      );
      await this.attachmentRepo.save(rows);
    }

    return saved;
  }

  /**
   * Ký Presigned GET URL (TTL 10 phút) cho toàn bộ ảnh đính kèm của 1 đơn -
   * chỉ cho phép CHỦ ĐƠN hoặc người có quyền duyệt/xem đúng scope (giống
   * hệt rule `isEligibleApprover` dùng cho approve/reject, CỘNG THÊM
   * trường hợp chính chủ dù họ không có `leave_requests.view/approve`).
   */
  async getAttachmentViewUrls(
    requestId: number,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ): Promise<{ id: number; key: string; url: string }[]> {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester', 'attachments'],
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }

    const isOwner = request.requesterId === viewerId;
    const canApproveOrView =
      viewerRole === Role.ADMIN ||
      scope === PermissionScope.ALL ||
      (await this.isEligibleApprover(
        request.requester.departmentId,
        viewerId,
        viewerRole,
        scope,
        request.requester.leaveApproverId,
      ));

    if (!isOwner && !canApproveOrView) {
      throw new ForbiddenException('Bạn không có quyền xem ảnh đính kèm của đơn này');
    }

    return Promise.all(
      (request.attachments || []).map(async (a) => ({
        id: a.id,
        // objectKey thô trên B2 - trả thêm để FE build cacheKey CHUNG với
        // storage-img (buildImageCacheKey('leave-attachments', key)), tránh
        // cache trùng 2 bản cho cùng 1 ảnh đính kèm (trước đây FE tự cache
        // theo `id` - đúng nhưng KHÔNG khớp key mà storage-img dùng, nên
        // cùng 1 ảnh bị tải + lưu 2 lần khác nhau).
        key: a.objectKey,
        url: await this.uploadsService.signAttachmentGetUrl(a.objectKey),
      })),
    );
  }
  
  /**
   * Lấy các đơn nghỉ phép ĐÃ DUYỆT có khoảng ngày giao với [from, to].
   * Dùng để dựng bảng "Tổng hợp chấm công" theo tháng (đánh dấu X/2, KL...).
   *
   * KHÔNG lọc theo role/cấp bậc (khác findHistory/findPending): bảng tổng
   * hợp hiển thị TOÀN BỘ nhân viên trả về từ useUsersList() (không lọc role),
   * và getAttendanceSummary() cũng không lọc role. Nếu áp lại logic "chỉ thấy
   * cấp dưới" ở đây (bản cũ dùng getSubordinateRoles), người xem sẽ bị thiếu
   * dấu nghỉ phép (X/2, KL, P) cho chính role của họ và các role cao hơn -
   * vd Admin xem bảng sẽ không thấy đơn nghỉ đã duyệt của chính "Admin" hay
   * của Manager cùng cấp/khác nhánh, dù dòng nhân viên đó vẫn hiện trên bảng.
   */
  async findApprovedInRange(from: string, to: string) {
    return this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .where('leave.status = :status', { status: LeaveStatus.APPROVED })
      // Giao khoảng ngày: đơn nghỉ có startDate <= to AND endDate >= from
      .andWhere('leave.startDate <= :to', { to })
      .andWhere('leave.endDate >= :from', { from })
      .orderBy('leave.startDate', 'ASC')
      .getMany();
  }

  /**
   * Get requests for the current user (My Leave Requests)
   */
  async findAll(userId: number) {
    return this.leaveRequestRepo.find({
      where: { requesterId: userId },
      relations: ['requester', 'approver'],
      order: { createdAt: 'DESC' }
    });
  }
  
  /**
   * Danh sách đơn đang chờ duyệt MÀ VIEWER CÓ QUYỀN DUYỆT - theo scope.
   */
  async findPending(viewerId: number, viewerRole: string, scope?: string | null) {
    // Thuần theo scope từ role_permissions - không fallback cứng theo Role.
    const isDeptScope = scope === PermissionScope.DEPARTMENT;
    const isAllScope = scope === PermissionScope.ALL;

    if (viewerRole !== Role.ADMIN && !isAllScope && !isDeptScope) return [];

    const query = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .where('leave.status = :status', { status: LeaveStatus.PENDING });

    if (viewerRole !== Role.ADMIN && !isAllScope && isDeptScope) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      // Đối xứng với isEligibleApprover(): ngoài phòng ban đang quản lý,
      // cộng thêm những requester gán riêng leave_approver_id = viewerId
      // (ngoại lệ, không cùng phòng ban). Nếu Manager không quản lý phòng
      // ban nào NHƯNG có ngoại lệ gán riêng, vẫn phải thấy - không return
      // [] sớm như trước migration AddLeaveApproverOverrideToUsers nữa.
      if (managedIds.length === 0) {
        query.andWhere('requester.leaveApproverId = :viewerId', { viewerId });
      } else {
        query.andWhere(
          new Brackets((qb) => {
            qb.where('requester.departmentId IN (:...deptIds)', { deptIds: managedIds })
              .orWhere('requester.leaveApproverId = :viewerId', { viewerId });
          }),
        );
      }
    }

    return query.orderBy('leave.createdAt', 'DESC').getMany();
  }

  /**
   * Lịch sử duyệt (Approved/Rejected) trong phạm vi VIEWER CÓ QUYỀN DUYỆT -
   * cùng bộ lọc scope với findPending().
   */
  async findHistory(viewerId: number, viewerRole: string, scope?: string | null) {
    // Thuần theo scope từ role_permissions - không fallback cứng theo Role.
    const isDeptScopeH = scope === PermissionScope.DEPARTMENT;
    const isAllScopeH = scope === PermissionScope.ALL;

    if (viewerRole !== Role.ADMIN && !isAllScopeH && !isDeptScopeH) return [];

    const query = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .leftJoinAndSelect('leave.approver', 'approver')
      .where('leave.status IN (:...statuses)', {
        statuses: [LeaveStatus.APPROVED, LeaveStatus.REJECTED]
      });

    if (viewerRole !== Role.ADMIN && !isAllScopeH && isDeptScopeH) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      // Đối xứng với findPending()/isEligibleApprover() - xem comment ở đó.
      if (managedIds.length === 0) {
        query.andWhere('requester.leaveApproverId = :viewerId', { viewerId });
      } else {
        query.andWhere(
          new Brackets((qb) => {
            qb.where('requester.departmentId IN (:...deptIds)', { deptIds: managedIds })
              .orWhere('requester.leaveApproverId = :viewerId', { viewerId });
          }),
        );
      }
    }

    // ⚠️ Trước đây không có take()/skip() nào - số đơn phép đã duyệt/từ chối
    // sẽ tích luỹ vô hạn theo thời gian sử dụng. Cap lại 200 bản ghi gần
    // nhất để tránh phình to dần mà không đổi contract (vẫn trả về mảng).
    return query.orderBy('leave.updatedAt', 'DESC').take(200).getMany();
  }
  
  /**
   * Approve request
   * Permission: bảng role-cặp ở đầu file (isEligibleApprover) - thay hoàn
   * toàn kiểm tra RolePriority cũ.
   */
  async approve(requestId: number, approverId: number, userRole: string, scope?: string | null) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester']
    });
    
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    
    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Can only approve pending requests');
    }
    
    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      approverId,
      userRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền phê duyệt đơn của người này');
    }
    
    // Deduct balance - đọc động deductsAnnualBalance theo leaveType.code
    // (thay so sánh cứng LeaveType.ANNUAL/SICK cũ). Loại phép có thể đã bị
    // xoá sau khi đơn được tạo (hiếm, race condition) - coi như false, không
    // chặn duyệt đơn vì lý do này.
    const leaveTypeRow = await this.leaveTypesService.getByCode(request.leaveType);
    if (leaveTypeRow?.deductsAnnualBalance) {
      await this.userRepo.decrement(
        { id: request.requesterId },
        'annualLeaveBalance',
        request.totalDays
      );
    }
    
    // Update request
    request.status = LeaveStatus.APPROVED;
    request.approverId = approverId;
    request.approvedAt = new Date();
    
    return this.leaveRequestRepo.save(request);
  }
  
  /**
   * Reject request - cùng rule role-cặp với approve() (isEligibleApprover).
   */
  async reject(
    requestId: number, 
    approverId: number, 
    rejectionReason: string,
    userRole: string,
    scope?: string | null,
  ) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester']
    });
    
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    
    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Can only reject pending requests');
    }

    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      approverId,
      userRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền từ chối đơn của người này');
    }
    
    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new BadRequestException('Vui lòng nhập lý do từ chối');
    }
    
    // Update request
    request.status = LeaveStatus.REJECTED;
    request.approverId = approverId;
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;
    
    return this.leaveRequestRepo.save(request);
  }
  
  /**
   * Cancel request (by requester)
   *
   * ⚠️ CẬP NHẬT (theo yêu cầu): huỷ đơn giờ dọn luôn ảnh đính kèm (nếu có) -
   * cả object thật trên B2 lẫn dòng `leave_request_attachments` trong DB.
   * Đơn đã huỷ không còn nghiệp vụ nào cần giữ ảnh (thường là giấy khám
   * bệnh - dữ liệu sức khoẻ nhạy cảm), không nên để tồn tại vô thời hạn.
   * Xoá B2 làm BEST-EFFORT (log warn nếu lỗi) - KHÔNG chặn việc huỷ đơn
   * nếu bước xoá ảnh gặp sự cố (giống pattern `deleteAvatar` ở uploads.service.ts).
   */
  async cancel(requestId: number, requesterId: number) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId, requesterId },
      relations: ['attachments'],
    });
    
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    
    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn đang chờ duyệt');
    }
    
    request.status = LeaveStatus.CANCELLED;
    request.cancelledAt = new Date();
    
    const saved = await this.leaveRequestRepo.save(request);

    const attachments = request.attachments || [];
    if (attachments.length > 0) {
      await Promise.all(
        attachments.map((a) =>
          this.uploadsService
            .deleteObject(this.uploadsService.leaveAttachmentsBucket, a.objectKey)
            .catch((err) => this.logger.warn(`Không xoá được ảnh đính kèm khi huỷ đơn: ${a.objectKey}`, err)),
        ),
      );
      await this.attachmentRepo.remove(attachments);
    }

    return saved;
  }

  /**
   * Xoá 1 ảnh đính kèm ĐÃ upload thẳng lên B2 (qua presign) nhưng CHƯA
   * (hoặc không còn) gắn vào đơn nghỉ phép thật nào - dùng khi:
   *  - Người dùng bấm xoá ảnh khỏi picker TRƯỚC khi bấm "Tạo đơn".
   *  - Người dùng đóng/huỷ Modal tạo đơn sau khi đã chọn ảnh (chưa bấm
   *    "Tạo đơn") - dọn hết ảnh đã lỡ PUT lên B2 trong phiên đó.
   *
   * 2 lớp an toàn bắt buộc:
   *  1. Key phải đúng namespace `leave-attachments/{userId}/` của CHÍNH
   *     người gọi - không cho xoá object của người khác dù đoán được key.
   *  2. Key KHÔNG được đang gắn với bất kỳ đơn nào trong DB
   *     (`leave_request_attachments`) - nếu đã gắn (đơn đã tạo thật), từ
   *     chối xoá qua đường này (phải qua `cancel()`), tránh 1 request cũ
   *     tự ý xoá "bằng chứng" ảnh của đơn ĐÃ NỘP thành công.
   */
  async discardOrphanAttachments(userId: number, keys: string[]) {
    const uniqueKeys = Array.from(new Set(keys)).slice(0, 20);
    const prefix = `leave-attachments/${userId}/`;

    const linked = uniqueKeys.length
      ? await this.attachmentRepo.find({ where: { objectKey: In(uniqueKeys) } })
      : [];
    const linkedKeys = new Set(linked.map((a) => a.objectKey));

    return Promise.all(
      uniqueKeys.map(async (key) => {
        if (!key.startsWith(prefix)) {
          return { key, deleted: false, reason: 'not_owner' as const };
        }
        if (linkedKeys.has(key)) {
          return { key, deleted: false, reason: 'already_linked' as const };
        }
        try {
          await this.uploadsService.deleteObject(this.uploadsService.leaveAttachmentsBucket, key);
          return { key, deleted: true as const };
        } catch (err) {
          this.logger.warn(`Không xoá được ảnh đính kèm bỏ dở: ${key}`, err as Error);
          return { key, deleted: false, reason: 'error' as const };
        }
      }),
    );
  }
  
  /**
   * Calculate total days (handle half days)
   */
  private calculateDays(start: Date, end: Date, duration: LeaveDuration): number {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    if (diffDays === 1 && duration !== LeaveDuration.FULL_DAY) {
      return 0.5;
    }
    
    return diffDays;
  }
}