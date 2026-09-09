import { Body, Controller, Delete, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StorageService } from './storage.service';
import { ListMediaDto } from './dto/list-media.dto';
import { DeleteMediaDto } from './dto/delete-media.dto';
import { BulkDeleteMediaDto } from './dto/bulk-delete-media.dto';
import { PresignMediaLibraryDto } from './dto/presign-media-library.dto';
import { UpdateStorageLimitDto } from './dto/update-storage-limit.dto';

@ApiTags('storage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('usage')
  @RequirePermission('storage.view')
  @ApiOperation({
    summary:
      'Dung lượng đã dùng (cache, có thể refresh thủ công qua POST usage/refresh) + hạn mức mềm',
  })
  async getUsage() {
    const [cache, softLimitGb] = await Promise.all([
      this.storageService.getUsageFromCache(),
      this.storageService.getSoftLimitGb(),
    ]);
    return { cache, softLimitGb };
  }

  @Post('usage/refresh')
  @RequirePermission('storage.manage')
  @ApiOperation({
    summary:
      'Tính lại THẬT dung lượng B2 ngay lúc gọi (không đợi cron ngoài) - dùng cho nút "Tính lại ngay" trên UI, ' +
      'đặc biệt cần thiết ở lần đầu bật tính năng khi cache rỗng. ' +
      'Tốn Class C transaction (liệt kê toàn bộ object) - không gọi tự động, chỉ khi Admin bấm.',
  })
  async refreshUsage() {
    return this.storageService.refreshUsageCache();
  }

  @Patch('usage/limit')
  @RequirePermission('storage.manage')
  @ApiOperation({ summary: 'Đổi hạn mức mềm (GB) - chỉ để hiển thị %, không chặn upload' })
  async updateLimit(@Body() dto: UpdateStorageLimitDto) {
    const softLimitGb = await this.storageService.updateSoftLimitGb(dto.softLimitGb);
    return { softLimitGb };
  }

  @Get('media')
  @RequirePermission('storage.view')
  @ApiOperation({ summary: 'Danh sách media phân trang (bucket: avatars | leave-attachments | media-library)' })
  async listMedia(@Query() dto: ListMediaDto) {
    return this.storageService.listMedia(dto.bucket, dto.cursor, dto.limit ?? 50);
  }

  @Post('media-library/presign')
  @RequirePermission('storage.manage')
  @ApiOperation({ summary: 'Xin Presigned PUT URL để thêm ảnh mới vào media-library' })
  async presignMediaLibraryUpload(@Body() dto: PresignMediaLibraryDto) {
    return this.storageService.presignMediaLibraryUpload(dto.contentType);
  }

  @Delete('media')
  @RequirePermission('storage.manage')
  @ApiOperation({ summary: 'Xoá 1 media - CHỈ hoạt động với bucket media-library (2 bucket còn lại view-only)' })
  async deleteMedia(@Body() dto: DeleteMediaDto) {
    await this.storageService.deleteMedia(dto.bucket, dto.key);
    return { success: true };
  }
}