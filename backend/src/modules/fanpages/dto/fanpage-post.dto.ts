import { IsString, IsNotEmpty, Length, IsOptional, IsUrl, Matches, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const URL_OPTS = { require_protocol: true, protocols: ['http', 'https'], require_tld: true };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateFanpagePostDto {
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

export class UpdateFanpagePostDto {
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