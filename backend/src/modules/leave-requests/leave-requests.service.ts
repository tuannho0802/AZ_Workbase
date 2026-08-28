import { Injectable, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import { LeaveRequest, LeaveStatus, LeaveType, LeaveDuration } from '../../database/entities/leave-request.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { Role } from '../../common/enums/role.enum';

/**
 * PERMISSIONS.md mục 2.6 - THAY THẾ HOÀN TOÀN cơ chế `RolePriority` chéo
 * phòng ban cũ (ADMIN:4, MANAGER:3, ASSISTANT:2, EMPLOYEE:1 - priority cao
 * hơn duyệt được đơn priority thấp hơn, không phụ thuộc phòng ban) bằng bảng
 * role-cặp cụ thể đã chốt với chủ dự án:
 *
 *   Người xin nghỉ (role) | Ai được duyệt đơn này
 *   -----------------------|--------------------------------------------
 *   admin                  | CHỈ admin
 *   assistant               | CHỈ admin
 *   manager                 | assistant HOẶC admin
 *   employee                 | manager CÙNG PHÒNG BAN với employee đó,
 *                           | HOẶC assistant, HOẶC admin
 *
 * Khác biệt quan trọng so với cơ chế cũ: KHÔNG còn thuần "priority cao hơn
 * thì duyệt được" - assistant KHÔNG duyệt được đơn của assistant khác (dù
 * cùng "priority" theo cách hiểu cũ), và manager CHỈ duyệt được đơn employee
 * ĐÚNG phòng ban mình đang quản lý (`department.manager_user_id = mình`,
 * KHÔNG phải phòng ban mình *thuộc về* - xem "Diễn giải quan trọng" mục 1
 * của PERMISSIONS.md), không phải "mọi phòng ban" như cơ chế cũ.
 */
const ELIGIBLE_APPROVER_ROLES: Record<string, string[]> = {
  [Role.ADMIN]: [Role.ADMIN],
  [Role.ASSISTANT]: [Role.ADMIN],
  [Role.MANAGER]: [Role.ASSISTANT, Role.ADMIN],
  [Role.EMPLOYEE]: [Role.MANAGER, Role.ASSISTANT, Role.ADMIN],
};

/**
 * Bảng NGƯỢC của ELIGIBLE_APPROVER_ROLES - dùng cho findPending()/findHistory()
 * để biết 1 approver (viewer) được thấy đơn của NHỮNG role nào. Suy ra trực
 * tiếp từ bảng trên (role nào có approverRole trong danh sách được duyệt thì
 * approverRole đó thấy được đơn của role đó):
 *   admin thấy được: admin, assistant, manager, employee (mọi role)
 *   assistant thấy được: assistant, manager, employee (KHÔNG thấy đơn admin)
 *   manager thấy được: CHỈ employee (và phải đúng phòng ban mình quản lý)
 *   employee: không thấy đơn ai (không có quyền duyệt)
 */
const VIEWER_SEES_REQUESTER_ROLES: Record<string, string[]> = {
  [Role.ADMIN]: [Role.ADMIN, Role.ASSISTANT, Role.MANAGER, Role.EMPLOYEE],
  [Role.ASSISTANT]: [Role.ASSISTANT, Role.MANAGER, Role.EMPLOYEE],
  [Role.MANAGER]: [Role.EMPLOYEE],
  [Role.EMPLOYEE]: [],
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,
    
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
  ) {}

  /**
   * Kiểm tra `approverId`(role `approverRole`) có được phép duyệt/từ chối
   * đơn của 1 người có role `requesterRole` + `requesterDepartmentId` hay
   * không - đúng bảng role-cặp ở đầu file. Dùng chung cho cả approve() lẫn
   * reject() (1 nguồn duy nhất, tránh lệch logic giữa 2 hàm).
   */
  private async isEligibleApprover(
    requesterRole: string,
    requesterDepartmentId: number | null,
    approverId: number,
    approverRole: string,
  ): Promise<boolean> {
    const eligibleRoles = ELIGIBLE_APPROVER_ROLES[requesterRole] ?? [];
    if (!eligibleRoles.includes(approverRole)) {
      return false;
    }

    if (approverRole === Role.MANAGER) {
      // Employee's approver Manager PHẢI là người đang quản lý ĐÚNG phòng
      // ban của employee đó (department.manager_user_id = approverId) -
      // không phải phòng ban Manager *thuộc về*.
      if (requesterDepartmentId == null) return false;
      const dept = await this.departmentRepo.findOne({
        where: { id: requesterDepartmentId, managerUserId: approverId },
      });
      return !!dept;
    }

    return true;
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
    
    // 4. Check balance (for annual/sick leave)
    if (dto.leaveType === LeaveType.ANNUAL || dto.leaveType === LeaveType.SICK) {
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
    
    // 5. Create request
    const leaveRequest = this.leaveRequestRepo.create({
      requesterId,
      leaveType: dto.leaveType,
      startDate,
      endDate,
      duration: dto.duration,
      totalDays,
      reason: dto.reason,
      attachmentUrl: dto.attachmentUrl || null,
      status: LeaveStatus.PENDING
    });
    
    return this.leaveRequestRepo.save(leaveRequest);
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
   * Danh sách đơn đang chờ duyệt MÀ VIEWER CÓ QUYỀN DUYỆT - theo đúng bảng
   * role-cặp ở đầu file (thay hoàn toàn cơ chế RolePriority chéo phòng ban
   * cũ). Manager CHỈ thấy đơn của Employee ĐÚNG phòng ban mình quản lý.
   */
  async findPending(viewerId: number, viewerRole: string) {
    const requesterRoles = VIEWER_SEES_REQUESTER_ROLES[viewerRole] ?? [];
    if (requesterRoles.length === 0) return [];

    const query = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .where('leave.status = :status', { status: LeaveStatus.PENDING })
      .andWhere('requester.role IN (:...roles)', { roles: requesterRoles });

    if (viewerRole === Role.MANAGER) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      if (managedIds.length === 0) return [];
      query.andWhere('requester.departmentId IN (:...deptIds)', { deptIds: managedIds });
    }

    return query.orderBy('leave.createdAt', 'DESC').getMany();
  }

  /**
   * Lịch sử duyệt (Approved/Rejected) trong phạm vi VIEWER CÓ QUYỀN DUYỆT -
   * cùng bộ lọc role/phòng ban với findPending() (đối xứng, tránh lệch nhau
   * theo thời gian).
   */
  async findHistory(viewerId: number, viewerRole: string) {
    const requesterRoles = VIEWER_SEES_REQUESTER_ROLES[viewerRole] ?? [];
    if (requesterRoles.length === 0) return [];

    const query = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .leftJoinAndSelect('leave.approver', 'approver')
      .where('leave.status IN (:...statuses)', { 
        statuses: [LeaveStatus.APPROVED, LeaveStatus.REJECTED] 
      })
      .andWhere('requester.role IN (:...roles)', { roles: requesterRoles });

    if (viewerRole === Role.MANAGER) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      if (managedIds.length === 0) return [];
      query.andWhere('requester.departmentId IN (:...deptIds)', { deptIds: managedIds });
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
  async approve(requestId: number, approverId: number, userRole: string) {
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
      request.requester.role,
      request.requester.departmentId,
      approverId,
      userRole,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền phê duyệt đơn của người này');
    }
    
    // Deduct balance
    if (request.leaveType === LeaveType.ANNUAL || request.leaveType === LeaveType.SICK) {
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
      request.requester.role,
      request.requester.departmentId,
      approverId,
      userRole,
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
   */
  async cancel(requestId: number, requesterId: number) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId, requesterId }
    });
    
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    
    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn đang chờ duyệt');
    }
    
    request.status = LeaveStatus.CANCELLED;
    request.cancelledAt = new Date();
    
    return this.leaveRequestRepo.save(request);
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