import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MediaSourcesService } from './media-sources.service';
import { CreateMediaSourceDto } from './dto/create-media-source.dto';
import { UpdateMediaSourceDto } from './dto/update-media-source.dto';

@ApiTags('Media Sources (Nguồn khách hàng)')
@ApiBearerAuth()
// FIX rủi ro rà soát toàn hệ thống: trước đây JwtAuthGuard ở class nhưng
// PermissionGuard bị lặp lại RIÊNG Ở TỪNG METHOD (5 chỗ) - dễ quên khi
// thêm endpoint mới, vô tình mở toang cho mọi user đã đăng nhập (không
// còn check permission gì). Gộp lên class-level vì controller này KHÔNG
// có route public nào (khác departments.controller.ts có GET /public) -
// an toàn để áp dụng chung cho toàn bộ method.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('media-sources')
export class MediaSourcesController {
    constructor(private readonly mediaSourcesService: MediaSourcesService) { }

    // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission ở đây (chỉ còn JwtAuthGuard qua
    // class-level @UseGuards) - 'media_sources.view' CHỈ dùng để FE gate
    // sidebar/trang "Quản lý nguồn" (nav-config.tsx). GET này còn được
    // CustomerForm.tsx gọi (useMediaSources()) để load dropdown "Nguồn" khi
    // MỌI nhân viên thêm khách hàng - dùng chung 1 permission cho cả 2 mục
    // đích khiến Admin tắt quyền xem trang quản lý vô tình chặn luôn tạo
    // khách hàng. Mirror đúng cách fix ở leave-types.controller.ts.
    @Get()
    @ApiOperation({
        summary: 'Lấy danh sách nguồn. activeOnly=true để chỉ lấy nguồn đang mở (dùng cho dropdown thêm khách hàng).',
    })
    @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
    async findAll(@Query('activeOnly') activeOnly?: string) {
        return this.mediaSourcesService.findAll(activeOnly === 'true');
    }

    @Post()
    @RequirePermission('media_sources.manage')
    @ApiOperation({ summary: 'Tạo nguồn mới (Admin, Assistant)' })
    async create(@Body() dto: CreateMediaSourceDto) {
        return this.mediaSourcesService.create(dto);
    }

    @Patch(':id')
    @RequirePermission('media_sources.manage')
    @ApiOperation({ summary: 'Sửa tên/thứ tự nguồn (Admin, Assistant)' })
    async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMediaSourceDto) {
        return this.mediaSourcesService.update(id, dto);
    }

    @Patch(':id/lock')
    @RequirePermission('media_sources.manage')
    @ApiOperation({ summary: 'Khoá nguồn - ẩn khỏi dropdown thêm khách hàng mới (Admin, Assistant)' })
    async lock(@Param('id', ParseIntPipe) id: number) {
        return this.mediaSourcesService.setLocked(id, true);
    }

    @Patch(':id/unlock')
    @RequirePermission('media_sources.manage')
    @ApiOperation({ summary: 'Mở khoá nguồn (Admin, Assistant)' })
    async unlock(@Param('id', ParseIntPipe) id: number) {
        return this.mediaSourcesService.setLocked(id, false);
    }

    // FIX PERMISSIONS.md mục 1 (quy tắc Xoá) + mục 2.5: tách riêng Xoá, CHỈ
    // Admin - cùng lý do với link-categories/link-groups (chưa có khái niệm
    // phòng ban cho Media Source nên không mở thêm cho Manager ở đây).
    @Delete(':id')
    @RequirePermission('media_sources.delete')
    @ApiOperation({ summary: 'Xoá nguồn - chỉ được nếu chưa có khách hàng nào dùng (chỉ Admin)' })
    async remove(@Param('id', ParseIntPipe) id: number) {
        return this.mediaSourcesService.remove(id);
    }
}