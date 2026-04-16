import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
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
    return this.leaveRequestsService.findPending(
      req.user.id,
      req.user.role,
      req.user.departmentId
    );
  }
  
  @Get('history')
  async findHistory(@Request() req) {
    return this.leaveRequestsService.findHistory(
      req.user.role,
      req.user.departmentId
    );
  }
  
  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Request() req) {
    return this.leaveRequestsService.approve(
      parseInt(id),
      req.user.id,
      req.user.role,
      req.user.departmentId
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
      req.user.departmentId
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
