import { Controller, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { BulkOperationsService } from './bulk-operations.service';

@ApiTags('bulk-operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('bulk-operations')
export class BulkOperationsController {
    constructor(private readonly service: BulkOperationsService) { }

    // Không gắn @RequirePermission: người thực hiện đã qua permission của thao tác gốc; ở đây chỉ cho
    // người thực hiện (hoặc Admin) hoàn tác trong 5 phút - service tự kiểm tra.
    @Post(':id/undo')
    @HttpCode(200)
    @ApiOperation({ summary: 'Hoàn tác thao tác hàng loạt (≤ 5 phút) - trả { restored, skipped }' })
    @ApiResponse({ status: 403, description: 'Không phải người thực hiện / Admin' })
    @ApiResponse({ status: 404, description: 'Không tìm thấy thao tác' })
    @ApiResponse({ status: 409, description: 'Đã hoàn tác rồi' })
    @ApiResponse({ status: 410, description: 'Quá hạn 5 phút' })
    undo(@Param('id', ParseIntPipe) id: number, @GetUser() user: { id: number; role: string }) {
        return this.service.undo(id, user);
    }
}