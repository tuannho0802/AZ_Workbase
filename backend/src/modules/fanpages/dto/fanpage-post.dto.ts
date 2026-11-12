import { IsString, IsNotEmpty, IsInt, Length, IsOptional, IsUrl, Matches, Max, Min, ValidateIf, IsEmail, ValidateNested, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { METRIC_MAX_VALUE } from '../helpers/fanpage-metrics.helper';

const URL_OPTS = { require_protocol: true, protocols: ['http', 'https'], require_tld: true };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class PostMetricsDto {
    @ApiPropertyOptional({ description: 'Lượt xem (nhập tay). null = xoá số đã nhập.' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Lượt xem phải là số nguyên' })
    @Min(0, { message: 'Lượt xem không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Lượt xem quá lớn' })
    views?: number | null;

    @ApiPropertyOptional({ description: 'Lượt thích (nhập tay). null = xoá số đã nhập.' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Lượt thích phải là số nguyên' })
    @Min(0, { message: 'Lượt thích không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Lượt thích quá lớn' })
    likes?: number | null;

    @ApiPropertyOptional({ description: 'Lượt bình luận (nhập tay). null = xoá số đã nhập.' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Lượt bình luận phải là số nguyên' })
    @Min(0, { message: 'Lượt bình luận không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Lượt bình luận quá lớn' })
    comments?: number | null;

    @ApiPropertyOptional({ description: 'Lượt chia sẻ (nhập tay). null = xoá số đã nhập.' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Lượt chia sẻ phải là số nguyên' })
    @Min(0, { message: 'Lượt chia sẻ không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Lượt chia sẻ quá lớn' })
    shares?: number | null;
}

/** Loại bài (E5a): id của `fanpage_post_types`; null = bỏ phân loại. Service kiểm tra tồn tại + chưa khoá. */
class PostTypeDto extends PostMetricsDto {
    @ApiPropertyOptional({ description: 'Loại bài (danh mục Loại bài). null = chưa phân loại.' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Type(() => Number)
    @IsInt({ message: 'Loại bài không hợp lệ' })
    @Min(1, { message: 'Loại bài không hợp lệ' })
    postTypeId?: number | null;
}

export class CreateFanpagePostDto extends PostTypeDto {
    @ApiProperty({ example: 'https://facebook.com/ten-page/posts/123', description: 'URL bài đăng (nhập tay)' })
    @IsString()
    @IsUrl(URL_OPTS, { message: 'URL bài đăng phải hợp lệ (bắt đầu bằng http:// hoặc https://)' })
    @Length(1, 500, { message: 'URL bài đăng tối đa 500 ký tự' })
    url: string;

    @ApiPropertyOptional({ example: 'Bài review tháng 11' })
    @IsOptional()
    @IsString()
    @Length(0, 200, { message: 'Tiêu đề tối đa 200 ký tự' })
    title?: string | null;

    @ApiPropertyOptional({ example: '2026-11-10', description: 'Ngày đăng YYYY-MM-DD' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(DATE_RE, { message: 'Ngày đăng phải có dạng YYYY-MM-DD' })
    postedDate?: string | null;

    @ApiPropertyOptional({ description: 'Ghi chú cho bài đăng (nếu có)' })
    @IsOptional()
    @IsString()
    @Length(0, 5000, { message: 'Ghi chú tối đa 5000 ký tự' })
    note?: string | null;
}

export class UpdateFanpagePostDto extends PostTypeDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsUrl(URL_OPTS, { message: 'URL bài đăng phải hợp lệ (bắt đầu bằng http:// hoặc https://)' })
    @Length(1, 500, { message: 'URL bài đăng tối đa 500 ký tự' })
    url?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Length(0, 200, { message: 'Tiêu đề tối đa 200 ký tự' })
    title?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(DATE_RE, { message: 'Ngày đăng phải có dạng YYYY-MM-DD' })
    postedDate?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Length(0, 5000, { message: 'Ghi chú tối đa 5000 ký tự' })
    note?: string | null;
}

/** GĐ5b - Lead nhập từ Page. SĐT BẮT BUỘC và phải là SĐT thật (không nhận `MISSING_*`) - khoá chống trùng (PLAN 15.8). */
/** Tối đa số link dán 1 lần (PLAN 6.3 - B4). */
export const MAX_BULK_POST_URLS = 50;

/**
 * `POST /fanpages/:fanpageId/posts/bulk` (B4 - dán nhiều link). Ngày đăng + loại bài dùng CHUNG cho cả lô.
 * Link sai/trùng KHÔNG làm hỏng cả lô: trả theo từng dòng ở `skipped[]`, phần hợp lệ vẫn tạo (1 transaction).
 */
export class BulkCreateFanpagePostsDto {
    @ApiProperty({ type: [String], description: 'Danh sách URL bài đăng (tối đa 50)' })
    @IsArray()
    @ArrayMinSize(1, { message: 'Cần ít nhất 1 link' })
    @ArrayMaxSize(MAX_BULK_POST_URLS, { message: `Tối đa ${MAX_BULK_POST_URLS} link mỗi lần` })
    @IsString({ each: true, message: 'Link không hợp lệ' })
    urls: string[];

    @ApiPropertyOptional({ example: '2026-11-10', description: 'Ngày đăng chung cho cả lô (YYYY-MM-DD)' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(DATE_RE, { message: 'Ngày đăng phải có dạng YYYY-MM-DD' })
    postedDate?: string | null;

    @ApiPropertyOptional({ description: 'Loại bài chung cho cả lô' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Type(() => Number)
    @IsInt({ message: 'Loại bài không hợp lệ' })
    @Min(1, { message: 'Loại bài không hợp lệ' })
    postTypeId?: number | null;
}

export class FanpageLeadDto {
    @ApiProperty({ example: 'Nguyễn Văn A' })
    @IsString()
    @IsNotEmpty({ message: 'Họ tên là bắt buộc' })
    @Length(1, 100, { message: 'Họ tên tối đa 100 ký tự' })
    name: string;

    @ApiProperty({ example: '0901234567' })
    @IsString()
    @Matches(/^(09|08|07|03|05)[0-9]{8}$/, { message: 'Số điện thoại không hợp lệ (Ví dụ: 0912345678)' })
    phone: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEmail({}, { message: 'Email không hợp lệ' })
    @Length(0, 255)
    email?: string;

    @ApiPropertyOptional({ description: 'Bỏ trống = nền tảng của Page nếu khớp 1 nguồn đang mở' })
    @IsOptional()
    @IsString()
    @Length(0, 100)
    source?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Length(0, 5000)
    note?: string;
}

export class FanpageLeadsQueryDto {
    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ default: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Length(0, 100)
    search?: string;
}

export class FanpageNoteDto {
    @ApiProperty({ description: 'Nội dung ghi chú tiến trình' })
    @IsString()
    @IsNotEmpty({ message: 'Nội dung ghi chú là bắt buộc' })
    @Length(1, 5000, { message: 'Ghi chú tối đa 5000 ký tự' })
    note: string;

    @ApiPropertyOptional({ type: () => FanpageLeadDto, description: 'Tạo kèm khách (cần thêm quyền customers.create - BE kiểm)' })
    @IsOptional()
    @ValidateNested()
    @Type(() => FanpageLeadDto)
    lead?: FanpageLeadDto;
}
