import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LeaveRequestsService } from './leave-requests.service';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard)
export class LeaveRequestsController {
  constructor(private leaveRequestsService: LeaveRequestsService) {}
  
  @Post()
  async create(@Body() dto: any, @Request() req) {
    return this.leaveRequestsService.create(dto, req.user.id);
  }
  
  @Get()
  async findAll(@Request() req) {
    return this.leaveRequestsService.findAll(req.user.id);
  }
  
  @Get('pending')
  async findPending(@Request() req) {
    return this.leaveRequestsService.findPending(req.user.id, req.user.role);
  }
  
  @Get('history')
  async findHistory(@Request() req) {
    return this.leaveRequestsService.findHistory(req.user.id, req.user.role);
  }

  @Get('approved-range')
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
  async approve(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.approve(
      parseInt(id),
      req.user.id,
      req.user.role,
    );
  }
  
  @Patch(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req
  ) {
    return this.leaveRequestsService.reject(
      parseInt(id),
      req.user.id,
      body.reason,
      req.user.role,
    );
  }
  
  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.cancel(
      parseInt(id),
      req.user.id
    );
  }
}