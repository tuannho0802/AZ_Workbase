import { Controller, Get, Post, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { UploadsService } from './uploads.service';
import { PresignAvatarDto } from './dto/presign-avatar.dto';
import { UpdateUploadLimitsDto } from './dto/update-upload-limits.dto';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('avatar/presign')
  @RequirePermission('profile.edit_avatar')
  @ApiOperation({ summary: 'Xin Presigned PUT URL để upload avatar thẳng lên B2' })
  presignAvatar(@Body() dto: PresignAvatarDto, @Request() req: any) {
    return this.uploadsService.presignAvatarUpload(req.user.id, dto.contentType);
  }

  // Không gắn @RequirePermission - bất kỳ user đã đăng nhập nào cũng cần
  // đọc giới hạn này để validate phía FE trước khi cho chọn/nén ảnh (avatar
  // + form tạo đơn nghỉ phép). Chỉ JwtAuthGuard ở class là đủ.
  @Get('limits')
  @ApiOperation({ summary: 'Lấy giới hạn số lượng/dung lượng ảnh hiện tại' })
  getLimits() {
    return this.uploadsService.getLimits();
  }

  @Patch('limits')
  @RequirePermission('uploads.manage_limits')
  @ApiOperation({ summary: 'Cập nhật giới hạn số lượng/dung lượng ảnh (Admin/Assistant)' })
  updateLimits(@Body() dto: UpdateUploadLimitsDto) {
    return this.uploadsService.updateLimits(dto);
  }
}
