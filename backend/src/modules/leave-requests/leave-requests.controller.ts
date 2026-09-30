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
import { BulkLeaveIdsDto } from './dto/bulk-leave-ids.dto';
import { QueryLeaveStatsDto } from './dto/query-leave-stats.dto';
import { LeaveRequestsStatsService } from './leave-requests-stats.service';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LeaveRequestsController {
  constructor(
    private leaveRequestsService: LeaveRequestsService,
    private uploadsService: UploadsService,
    private leaveRequestsStatsService: LeaveRequestsStatsService,
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

  // ── WEEK-MODE (phân trang theo TUẦN, lazy-load từng tuần) ───────────────────
  // Thay findAll()/findPending()/findHistory() ở 2 trang /nghi-phep và
  // /duyet-phep để dữ liệu lớn dần không làm lag. 3 route cũ bên dưới VẪN
  // giữ nguyên (không đổi contract) cho các nơi gọi khác. Route tĩnh
  // ('mine/...', 'pending/...', 'history/...') không đụng ':id/...' vì khác
  // segment cuối.
  @Get('mine/paged')
  @RequirePermission('leave_requests.request')
  async findMinePaged(@Request() req, @Query() query: QueryLeaveRequestsDto) {
    return this.leaveRequestsService.findMinePaged(req.user.id, query);
  }

  @Get('mine/pending-count')
  @RequirePermission('leave_requests.request')
  async countMyPending(@Request() req) {
    return this.leaveRequestsService.countMyPending(req.user.id);
  }

  @Get('pending/paged')
  @RequirePermission('leave_requests.approve')
  async findPendingPaged(
    @Request() req,
    @Query() query: QueryLeaveRequestsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.findPendingPaged(req.user.id, req.user.role, scope, query);
  }

  @Get('pending/count')
  @RequirePermission('leave_requests.approve')
  async countPending(@Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.countPending(req.user.id, req.user.role, scope);
  }

  @Get('history/paged')
  @RequirePermission('leave_requests.view')
  async findHistoryPaged(
    @Request() req,
    @Query() query: QueryLeaveRequestsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.findHistoryPaged(req.user.id, req.user.role, scope, query);
  }

  // Thống kê nghỉ phép (tab "Thống kê" trang Duyệt phép) - cùng quyền + scope với tab
  // Lịch sử (`leave_requests.view`). Route tĩnh 'stats' không đụng ':id/...' (khác số segment).
  @Get('stats')
  @RequirePermission('leave_requests.view')
  async getStats(
    @Request() req,
    @Query() query: QueryLeaveStatsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsStatsService.getStats(query, req.user.id, req.user.role, scope);
  }

  // ── THÙNG RÁC + XOÁ (xem LeaveRequestsService.trash/hardDelete) ─────────────
  // Xem thùng rác dùng chung quyền `view` (cùng phạm vi lịch sử duyệt); mọi
  // hành động xoá gate `leave_requests.delete` (có scope, mặc định chỉ Admin).
  // Đơn PENDING chỉ chủ đơn huỷ được (PATCH :id/cancel bên dưới) - `:id/trash`
  // từ chối pending với MỌI role. Route tĩnh 'trash/...'/'bulk-trash' không đụng
  // ':id/...' (khác số segment / method).
  @Get('trash/paged')
  @RequirePermission('leave_requests.view')
  async findTrashPaged(
    @Request() req,
    @Query() query: QueryLeaveRequestsDto,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.findTrashPaged(req.user.id, req.user.role, scope, query);
  }

  @Post('bulk-trash')
  @RequirePermission('leave_requests.delete')
  async bulkTrash(
    @Body() dto: BulkLeaveIdsDto,
    @Request() req,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.bulkTrash(dto.ids, req.user.id, req.user.role, scope);
  }

  @Post('trash/bulk-delete')
  @RequirePermission('leave_requests.delete')
  async bulkHardDelete(
    @Body() dto: BulkLeaveIdsDto,
    @Request() req,
    @GetPermissionScope() scope?: string | null,
  ) {
    return this.leaveRequestsService.bulkHardDelete(dto.ids, req.user.id, req.user.role, scope);
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

  // Chuyển đơn ĐÃ DUYỆT/TỪ CHỐI vào thùng rác (nút "Huỷ" ở tab Lịch sử).
  @Patch(':id/trash')
  @RequirePermission('leave_requests.delete')
  async trash(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.trash(parseInt(id), req.user.id, req.user.role, scope);
  }

  // Xoá vĩnh viễn - CHỈ đơn đã ở thùng rác (service chặn nếu chưa có cancelled_at).
  @Delete(':id')
  @RequirePermission('leave_requests.delete')
  async hardDelete(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string | null) {
    return this.leaveRequestsService.hardDelete(parseInt(id), req.user.id, req.user.role, scope);
  }
}