import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';
import { LeaveRequestsService } from './leave-requests.service';
import { UploadsService } from '../uploads/uploads.service';
import { PresignAttachmentDto } from '../uploads/dto/presign-attachment.dto';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LeaveRequestsController {
  constructor(
    private leaveRequestsService: LeaveRequestsService,
    private uploadsService: UploadsService,
  ) { }

  // Presign đặt ở đây (không phải UploadsController chung) vì gắn đúng
  // permission `leave_requests.request` - chưa có leaveRequestId lúc gọi
  // (đang điền form tạo đơn), key trả về được gửi kèm khi POST / bên dưới.
  @Post('attachments/presign')
  @RequirePermission('leave_requests.request')
  async presignAttachment(@Body() dto: PresignAttachmentDto, @Request() req) {
    return this.uploadsService.presignAttachmentUpload(req.user.id, dto.contentType);
  }

  @Get(':id/attachment-urls')
  @RequirePermission('leave_requests.request')
  async getAttachmentUrls(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.getAttachmentViewUrls(+id, req.user.id, req.user.role, scope);
  }

  @Post()
  @RequirePermission('leave_requests.request')
  async create(@Body() dto: any, @Request() req) {
    return this.leaveRequestsService.create(dto, req.user.id);
  }
  
  @Get()
  @RequirePermission('leave_requests.request')
  async findAll(@Request() req) {
    return this.leaveRequestsService.findAll(req.user.id);
  }
  
  @Get('pending')
  @RequirePermission('leave_requests.approve')
  async findPending(@Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.findPending(req.user.id, req.user.role, scope);
  }
  
  @Get('history')
  @RequirePermission('leave_requests.view')
  async findHistory(@Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.findHistory(req.user.id, req.user.role, scope);
  }

  @Get('approved-range')
  @RequirePermission('leave_requests.view')
  async findApprovedInRange(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!from || !to || !dateRegex.test(from) || !dateRegex.test(to)) {
      throw new BadRequestException('from/to phải theo định dạng YYYY-MM-DD');
    }
    // Không lọc theo role của người gọi - xem comment ở service. Route này
    // chỉ phục vụ bảng tổng hợp chấm công nội bộ (đã có JwtAuthGuard ở class).
    return this.leaveRequestsService.findApprovedInRange(from, to);
  }
  
  @Patch(':id/approve')
  @RequirePermission('leave_requests.approve')
  async approve(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.approve(
      parseInt(id),
      req.user.id,
      req.user.role,
      scope,
    );
  }
  
  @Patch(':id/reject')
  @RequirePermission('leave_requests.approve')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.reject(
      parseInt(id),
      req.user.id,
      body.reason,
      req.user.role,
      scope,
    );
  }
  
  @Patch(':id/cancel')
  @RequirePermission('leave_requests.request')
  async cancel(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.cancel(
      parseInt(id),
      req.user.id
    );
  }
}