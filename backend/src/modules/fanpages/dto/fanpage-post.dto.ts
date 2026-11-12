import { IsString, IsInt, Length, IsOptional, IsUrl, Matches, Max, Min, ValidateIf } from 'class-validator';
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

export class CreateFanpagePostDto extends PostMetricsDto {
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

export class UpdateFanpagePostDto extends PostMetricsDto {
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

export class FanpageNoteDto {
    @ApiProperty({ description: 'Nội dung ghi chú tiến trình' })
    @IsString()
    @IsNotEmpty({ message: 'Nội dung ghi chú là bắt buộc' })
    @Length(1, 5000, { message: 'Ghi chú tối đa 5000 ký tự' })
    note: string;
}