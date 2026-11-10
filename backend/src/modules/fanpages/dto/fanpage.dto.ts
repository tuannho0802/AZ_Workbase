import { IsString, IsNotEmpty, Length, IsOptional, IsInt, IsBoolean, IsUrl, IsIn, IsArray, ArrayMinSize, ArrayMaxSize, ArrayUnique } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const MAX_OWNERS = 20;
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
}