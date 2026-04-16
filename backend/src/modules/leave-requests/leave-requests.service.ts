import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import { LeaveRequest, LeaveStatus, LeaveType, LeaveDuration } from '../../database/entities/leave-request.entity';
import { User } from '../../database/entities/user.entity';

interface CreateLeaveRequestDto {
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  duration: LeaveDuration;
  reason: string;
  attachmentUrl?: string;
}

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,
    
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}
  
  /**
   * Create new leave request
   * Validation: Balance check + Conflict check
   */
  async create(dto: CreateLeaveRequestDto, requesterId: number) {
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
        status: Not(LeaveStatus.REJECTED) && Not(LeaveStatus.CANCELLED),
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
   */
  async findPending(userId: number, userRole: string, departmentId: number) {
    const query = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .where('leave.status = :status', { status: LeaveStatus.PENDING })
      .orderBy('leave.createdAt', 'ASC');
    
    if (userRole !== 'admin') {
      query.andWhere('requester.departmentId = :deptId', { deptId: departmentId });
    }
    
    return query.getMany();
  }
  
  /**
   * Get approval history (Approved/Rejected)
   */
  async findHistory(userRole: string, departmentId: number) {
    const query = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('leave.approver', 'approver')
      .where('leave.status IN (:...statuses)', { 
        statuses: [LeaveStatus.APPROVED, LeaveStatus.REJECTED] 
      })
      .orderBy('leave.updatedAt', 'DESC');
    
    if (userRole !== 'admin') {
      query.andWhere('requester.departmentId = :deptId', { deptId: departmentId });
    }
    
    return query.getMany();
  }
  
  /**
   * Approve request
   * Permission: Manager (dept), Admin (all)
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
    
    // Permission check
    if (userRole !== 'admin' && request.requester.departmentId !== userDeptId) {
      throw new ForbiddenException('You can only approve requests in your department');
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
   * Require rejection reason
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
    
    // Permission check
    if (userRole !== 'admin' && request.requester.departmentId !== userDeptId) {
      throw new ForbiddenException('You can only reject requests in your department');
    }
    
    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new BadRequestException('Rejection reason is required');
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
   * Only pending requests can be cancelled
   */
  async cancel(requestId: number, requesterId: number) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId, requesterId }
    });
    
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    
    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Can only cancel pending requests');
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
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end
    
    if (diffDays === 1 && duration !== LeaveDuration.FULL_DAY) {
      return 0.5; // Half day
    }
    
    return diffDays;
  }
}
