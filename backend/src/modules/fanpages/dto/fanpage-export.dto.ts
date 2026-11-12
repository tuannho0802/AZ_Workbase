import { ApiPropertyOptional } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { IsOptional } from 'class-validator';
import { FanpageQueryDto } from './fanpage.dto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /fanpages/export` (A4) - cùng bộ lọc với danh sách Page (nền tảng, người phụ trách, tình trạng, nhịp đăng, lưu trữ, UTM...).
 * `from`/`to` (tuỳ chọn) giới hạn sheet Bài đăng (theo ngày đăng) + Số liệu (theo ngày nhập) + khối Khách & Tiền nạp; bỏ trống = mọi dữ liệu
 * (khối Khách & Tiền nạp lúc đó lấy 30 ngày gần nhất, ghi rõ kỳ trên sheet).
 */
export class FanpageExportQueryDto extends FanpageQueryDto {
    @ApiPropertyOptional({ example: '2026-11-01', description: 'Từ ngày (YYYY-MM-DD)' })
    @IsOptional()
    @Matches(DATE_RE, { message: 'Từ ngày không hợp lệ (YYYY-MM-DD)' })
    from?: string;

    @ApiPropertyOptional({ example: '2026-11-30', description: 'Đến ngày (YYYY-MM-DD)' })
    @IsOptional()
    @Matches(DATE_RE, { message: 'Đến ngày không hợp lệ (YYYY-MM-DD)' })
    to?: string;
}