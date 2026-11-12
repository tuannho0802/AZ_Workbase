import { IsString, IsNotEmpty, Length, IsOptional, IsInt, IsBoolean, IsUrl, IsIn, IsArray, ArrayMinSize, ArrayMaxSize, ArrayUnique, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

const MAX_OWNERS = 20;
export const MAX_TARGET_POSTS_PER_WEEK = 35;

/** ''/null -> null (xoá mục tiêu), còn lại ép số; để @IsInt/@Min/@Max bắt giá trị sai. */
const toNullableNumber = ({ value }: { value: unknown }) => (value === null || value === '' ? null : Number(value));
const URL_OPTS = { require_protocol: true, protocols: ['http', 'https'], require_tld: true };

export class CreateFanpageDto {
    @ApiProperty({ example: 1 })
    @Type(() => Number)
    @IsInt({ message: 'Nền tảng không hợp lệ' })
    platformId: number;

    @ApiProperty({ example: 'Fanpage Review Sàn A' })
    @IsString()
    @IsNotEmpty({ message: 'Tên Page là bắt buộc' })
    @Length(1, 150, { message: 'Tên Page tối đa 150 ký tự' })
    name: string;

    @ApiProperty({ example: 'https://facebook.com/ten-page' })
    @IsString()
    @IsUrl(URL_OPTS, { message: 'Link Page phải là URL hợp lệ (bắt đầu bằng http:// hoặc https://)' })
    @Length(1, 500, { message: 'Link Page tối đa 500 ký tự' })
    url: string;

    @ApiPropertyOptional({ type: [Number], description: 'Danh sách người phụ trách (phần tử đầu = người phụ trách chính) - bỏ trống = chính người tạo' })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1, { message: 'Cần ít nhất 1 người phụ trách' })
    @ArrayMaxSize(MAX_OWNERS, { message: `Tối đa ${MAX_OWNERS} người phụ trách` })
    @ArrayUnique({ message: 'Người phụ trách bị trùng' })
    @Type(() => Number)
    @IsInt({ each: true, message: 'Người phụ trách không hợp lệ' })
    ownerIds?: number[];

    @ApiPropertyOptional({ description: 'Tình trạng Page (danh mục fanpage-health-statuses). Bỏ trống khi tạo = tình trạng mặc định' })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Tình trạng Page không hợp lệ' })
    healthStatusId?: number;

    @ApiPropertyOptional({ description: 'Ghi chú ngắn về tình trạng (lý do bị hạn chế/khoá...). null/"" = xoá ghi chú' })
    @IsOptional()
    @IsString()
    @Length(0, 255, { message: 'Ghi chú tình trạng tối đa 255 ký tự' })
    healthNote?: string | null;

    @ApiPropertyOptional({ description: `Mục tiêu số bài/tuần (1-${MAX_TARGET_POSTS_PER_WEEK}); null = không đặt mục tiêu` })
    @IsOptional()
    @Transform(toNullableNumber)
    @IsInt({ message: 'Mục tiêu bài/tuần phải là số nguyên' })
    @Min(1, { message: 'Mục tiêu bài/tuần tối thiểu là 1' })
    @Max(MAX_TARGET_POSTS_PER_WEEK, { message: `Mục tiêu bài/tuần tối đa là ${MAX_TARGET_POSTS_PER_WEEK}` })
    targetPostsPerWeek?: number | null;
}

export class UpdateFanpageDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Nền tảng không hợp lệ' })
    platformId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Tên Page không được để trống' })
    @Length(1, 150, { message: 'Tên Page tối đa 150 ký tự' })
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsUrl(URL_OPTS, { message: 'Link Page phải là URL hợp lệ (bắt đầu bằng http:// hoặc https://)' })
    @Length(1, 500, { message: 'Link Page tối đa 500 ký tự' })
    url?: string;

    @ApiPropertyOptional({ type: [Number], description: 'Thay toàn bộ danh sách người phụ trách (phần tử đầu = chính)' })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1, { message: 'Cần ít nhất 1 người phụ trách' })
    @ArrayMaxSize(MAX_OWNERS, { message: `Tối đa ${MAX_OWNERS} người phụ trách` })
    @ArrayUnique({ message: 'Người phụ trách bị trùng' })
    @Type(() => Number)
    @IsInt({ each: true, message: 'Người phụ trách không hợp lệ' })
    ownerIds?: number[];

    @ApiPropertyOptional({ description: 'Tình trạng Page (danh mục fanpage-health-statuses). Bỏ trống khi tạo = tình trạng mặc định' })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Tình trạng Page không hợp lệ' })
    healthStatusId?: number;

    @ApiPropertyOptional({ description: 'Ghi chú ngắn về tình trạng (lý do bị hạn chế/khoá...). null/"" = xoá ghi chú' })
    @IsOptional()
    @IsString()
    @Length(0, 255, { message: 'Ghi chú tình trạng tối đa 255 ký tự' })
    healthNote?: string | null;

    @ApiPropertyOptional({ description: `Mục tiêu số bài/tuần (1-${MAX_TARGET_POSTS_PER_WEEK}); null = không đặt mục tiêu` })
    @IsOptional()
    @Transform(toNullableNumber)
    @IsInt({ message: 'Mục tiêu bài/tuần phải là số nguyên' })
    @Min(1, { message: 'Mục tiêu bài/tuần tối thiểu là 1' })
    @Max(MAX_TARGET_POSTS_PER_WEEK, { message: `Mục tiêu bài/tuần tối đa là ${MAX_TARGET_POSTS_PER_WEEK}` })
    targetPostsPerWeek?: number | null;

    @ApiPropertyOptional({ description: 'false = ngừng theo dõi' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class FanpageQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    platformId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    ownerId?: number;

    @ApiPropertyOptional({ enum: ['true', 'false'] })
    @IsOptional()
    @IsIn(['true', 'false'])
    isActive?: 'true' | 'false';

    @ApiPropertyOptional({ description: 'Tìm theo tên hoặc link Page' })
    @IsOptional()
    @IsString()
    @Length(0, 100)
    search?: string;

    @ApiPropertyOptional({ description: 'Lọc theo Tình trạng Page' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    healthStatusId?: number;

    @ApiPropertyOptional({ enum: ['paused', 'new', 'silent', 'at_risk', 'ok'], description: 'Lọc theo trạng thái nhịp đăng' })
    @IsOptional()
    @IsIn(['paused', 'new', 'silent', 'at_risk', 'ok'])
    cadence?: 'paused' | 'new' | 'silent' | 'at_risk' | 'ok';

    @ApiPropertyOptional({ enum: ['false', 'true', 'all'], description: 'Page đã lưu trữ: false (mặc định) = ẩn, true = chỉ đã lưu trữ, all = cả hai' })
    @IsOptional()
    @IsIn(['false', 'true', 'all'])
    archived?: 'false' | 'true' | 'all';

    @ApiPropertyOptional({ description: 'Chỉ Page đang gắn UTM này (GĐ5)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    utmId?: number;

    @ApiPropertyOptional({ enum: ['true'], description: 'true = chỉ Page "mồ côi" (không còn người phụ trách đang hoạt động)' })
    @IsOptional()
    @IsIn(['true'])
    orphan?: 'true';
}