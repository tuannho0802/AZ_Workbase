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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { MediaSourcesService } from './media-sources.service';
import { CreateMediaSourceDto } from './dto/create-media-source.dto';
import { UpdateMediaSourceDto } from './dto/update-media-source.dto';

@ApiTags('Media Sources (Nguồn khách hàng)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media-sources')
export class MediaSourcesController {
    constructor(private readonly mediaSourcesService: MediaSourcesService) { }

    // Không giới hạn role - MỌI nhân viên đã đăng nhập cần gọi được endpoint
    // này để load dropdown "Nguồn" khi thêm khách hàng (không chỉ admin).
    // Quyền CRUD/khoá-mở mới giới hạn admin (xem các endpoint bên dưới).
    @Get()
    @ApiOperation({
        summary: 'Lấy danh sách nguồn. activeOnly=true để chỉ lấy nguồn đang mở (dùng cho dropdown thêm khách hàng).',
    })
    @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
    async findAll(@Query('activeOnly') activeOnly?: string) {
        return this.mediaSourcesService.findAll(activeOnly === 'true');
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Tạo nguồn mới (chỉ admin)' })
    async create(@Body() dto: CreateMediaSourceDto) {
        return this.mediaSourcesService.create(dto);
    }

    @Patch(':id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Sửa tên/thứ tự nguồn (chỉ admin)' })
    async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMediaSourceDto) {
        return this.mediaSourcesService.update(id, dto);
    }

    @Patch(':id/lock')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Khoá nguồn - ẩn khỏi dropdown thêm khách hàng mới (chỉ admin)' })
    async lock(@Param('id', ParseIntPipe) id: number) {
        return this.mediaSourcesService.setLocked(id, true);
    }

    @Patch(':id/unlock')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Mở khoá nguồn (chỉ admin)' })
    async unlock(@Param('id', ParseIntPipe) id: number) {
        return this.mediaSourcesService.setLocked(id, false);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Xoá nguồn - chỉ được nếu chưa có khách hàng nào dùng (chỉ admin)' })
    async remove(@Param('id', ParseIntPipe) id: number) {
        return this.mediaSourcesService.remove(id);
    }
}