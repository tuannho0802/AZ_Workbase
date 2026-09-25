import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';
import { LeaveRequestsService } from './leave-requests.service';
import { UploadsService } from '../uploads/uploads.service';
import { PresignAttachmentDto } from '../uploads/dto/presign-attachment.dto';
import { DiscardAttachmentsDto } from './dto/discard-attachments.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';

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
    return this.uploadsService.presignAttachmentUpload(req.user.id, dto.contentType, dto.leaveType, dto.index);
  }

  // Dọn ảnh đã PUT lên B2 nhưng CHƯA gắn vào đơn nào (huỷ Modal / xoá khỏi
  // picker trước khi bấm "Tạo đơn") - xem comment chi tiết ở
  // LeaveRequestsService.discardOrphanAttachments().
  @Post('attachments/discard')
  @RequirePermission('leave_requests.request')
  async discardAttachments(@Body() dto: DiscardAttachmentsDto, @Request() req) {
    return this.leaveRequestsService.discardOrphanAttachments(req.user.id, dto.keys);
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

  // Sửa đơn (User báo lỡ set sai ngày) - hành động QUẢN TRỊ "sửa hộ", tách
  // hẳn quyền với `leave_requests.request` (chỉ tạo/xem đơn của CHÍNH
  // MÌNH). Không giới hạn ':id/...' đứng sau route tĩnh nào ở controller
  // này nên không có rủi ro route-order như 'poll'/'read-all' ở Thông báo.
  @Patch(':id')
  @RequirePermission('leave_requests.edit')
  async update(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.update(
      parseInt(id),
      dto,
      req.user.id,
      req.user.role,
      scope,
    );
  }

  @Get()
  @RequirePermission('leave_requests.request')
  async findAll(@Request() req, @Query() query: QueryLeaveRequestsDto) {
    return this.leaveRequestsService.findAll(req.user.id, query);
  }
  
  @Get('pending')
  @RequirePermission('leave_requests.approve')
  async findPending(
    @Request() req,
    @Query() query: QueryLeaveRequestsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.findPending(req.user.id, req.user.role, scope, query);
  }
  
  @Get('history')
  @RequirePermission('leave_requests.view')
  async findHistory(
    @Request() req,
    @Query() query: QueryLeaveRequestsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.findHistory(req.user.id, req.user.role, scope, query);
  }

  // Tab "Thùng rác" ở duyet-phep - đơn ĐÃ xoá mềm, cùng phạm vi scope với
  // quyền `leave_requests.delete` (ai xoá được đơn nào thì xem/khôi phục
  // được đúng đơn đó trong thùng rác - xem findTrash() ở Service).
  @Get('trash')
  @RequirePermission('leave_requests.delete')
  async findTrash(
    @Request() req,
    @Query() query: QueryLeaveRequestsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.findTrash(req.user.id, req.user.role, scope, query);
  }

  // Tab "Thùng rác" ở nghi-phep/page.tsx - CHỈ đơn CỦA CHÍNH VIEWER, gate
  // bởi `leave_requests.request` (ai xin nghỉ cũng có) - KHÔNG cần
  // `leave_requests.delete` (quyền đó dành riêng cho approver xem/xoá đơn
  // NGƯỜI KHÁC, xem GET 'trash' phía trên).
  @Get('my-trash')
  @RequirePermission('leave_requests.request')
  async findMyTrash(@Request() req, @Query() query: QueryLeaveRequestsDto) {
    return this.leaveRequestsService.findMyTrash(req.user.id, query);
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

  // Xoá mềm (đưa vào Thùng rác) - phạm vi scope giống isEligibleApprover()
  // (mirror approve/reject: admin/scope='all' -> mọi đơn, scope='department'
  // -> chỉ đơn của nhân viên phòng ban mình quản lý).
  @Delete(':id')
  @RequirePermission('leave_requests.delete')
  async softDelete(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.softDelete(parseInt(id), req.user.id, req.user.role, scope);
  }

  @Patch('trash/:id/restore')
  @RequirePermission('leave_requests.delete')
  async restoreFromTrash(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.restoreFromTrash(parseInt(id), req.user.id, req.user.role, scope);
  }

  // Xoá vĩnh viễn - permission RIÊNG `leave_requests.hard_delete`, mặc định
  // chỉ Admin (xem migration SeedLeaveRequestsDeletePermissions). Service
  // CHỈ chấp nhận scope='all', không đủ với scope='department'.
  @Delete('trash/:id/hard-delete')
  @RequirePermission('leave_requests.hard_delete')
  async hardDelete(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.hardDelete(parseInt(id), req.user.id, req.user.role, scope);
  }

  // ── Tự phục vụ (nghi-phep/page.tsx) - đơn CỦA CHÍNH MÌNH, gate bởi
  // `leave_requests.request` (KHÔNG cần leave_requests.delete/hard_delete -
  // 2 quyền đó dành cho approver/admin thao tác đơn NGƯỜI KHÁC ở trên).
  // Đặt SAU cùng để không lẫn với các route ':id'/'trash/:id/...' phía
  // trên (khác số segment/literal, không thực sự xung đột nhưng để đọc dễ
  // theo nhóm chức năng).

  // Alias: DELETE :id/self -> goi cancel() (Owner huy don PENDING cua chinh minh)
  @Delete(':id/self')
  @RequirePermission('leave_requests.request')
  async selfCancel(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.cancel(parseInt(id), req.user.id);
  }

  @Patch('my-trash/:id/restore')
  @RequirePermission('leave_requests.request')
  async selfRestoreFromTrash(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.selfRestoreFromTrash(parseInt(id), req.user.id);
  }

  @Delete('my-trash/:id/hard-delete')
  @RequirePermission('leave_requests.request')
  async selfHardDelete(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.selfHardDelete(parseInt(id), req.user.id);
  }
}