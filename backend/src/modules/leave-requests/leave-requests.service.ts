import { Injectable, BadRequestException, ForbiddenException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import { LeaveRequest, LeaveStatus, LeaveType, LeaveDuration } from '../../database/entities/leave-request.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';

const ROLE_PRIORITY: Record<string, number> = {
  [Role.ADMIN]: 4,
  [Role.MANAGER]: 3,
  [Role.ASSISTANT]: 2,
  [Role.EMPLOYEE]: 1,
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,
    
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  private getSubordinateRoles(role: string): string[] {
    const priority = ROLE_PRIORITY[role] || 0;
    return Object.entries(ROLE_PRIORITY)
      .filter(([_, p]) => p < priority)
      .map(([r, _]) => r);
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
   * Get pending requests (for approvers)
   * Priority: Admin (4) > Manager (3) > Assistant (2) > Sales (1)
   * Cross-department: Enabled
   */
  async findPending(userRole: string) {
    const subRoles = this.getSubordinateRoles(userRole);
    if (subRoles.length === 0) return [];

    return this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .where('leave.status = :status', { status: LeaveStatus.PENDING })
      .andWhere('requester.role IN (:...roles)', { roles: subRoles })
      .orderBy('leave.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get approval history (Approved/Rejected)
   * Cross-department: Enabled
   */
  async findHistory(userRole: string) {
    const subRoles = this.getSubordinateRoles(userRole);
    if (subRoles.length === 0) return [];

    return this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .leftJoinAndSelect('leave.approver', 'approver')
      .where('leave.status IN (:...statuses)', { 
        statuses: [LeaveStatus.APPROVED, LeaveStatus.REJECTED] 
      })
      .andWhere('requester.role IN (:...roles)', { roles: subRoles })
      .orderBy('leave.updatedAt', 'DESC')
      .getMany();
  }
  
  /**
   * Approve request
   * Permission: Hierarchical check + Department check
   */
  async approve(requestId: number, approverId: number, userRole: string, userDeptId: number) {
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
    
    // 🔒 Security Check: Hierarchy
    const requesterPriority = ROLE_PRIORITY[request.requester.role] || 0;
    const approverPriority = ROLE_PRIORITY[userRole] || 0;
    
    if (requesterPriority >= approverPriority) {
      throw new ForbiddenException('Bạn không có quyền phê duyệt đơn của cấp bậc này');
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
   * Reject request
   */
  async reject(
    requestId: number, 
    approverId: number, 
    rejectionReason: string,
    userRole: string,
    userDeptId: number
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

    // 🔒 Security Check: Hierarchy
    const requesterPriority = ROLE_PRIORITY[request.requester.role] || 0;
    const approverPriority = ROLE_PRIORITY[userRole] || 0;
    
    if (requesterPriority >= approverPriority) {
      throw new ForbiddenException('Bạn không có quyền từ chối đơn của cấp bậc này');
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
