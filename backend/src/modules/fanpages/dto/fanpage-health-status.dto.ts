import { IsString, IsNotEmpty, Length, IsOptional, IsInt, IsBoolean, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateFanpageHealthStatusDto {
    @ApiProperty({ example: 'Bị hạn chế' })
    @IsString()
    @IsNotEmpty({ message: 'Tên tình trạng là bắt buộc' })
    @Length(1, 50, { message: 'Tên tình trạng tối đa 50 ký tự' })
    name: string;

    @ApiPropertyOptional({ example: '#fa8c16' })
    @IsOptional()
    @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải có dạng #RRGGBB' })
    color?: string;

    @ApiPropertyOptional({ description: 'true = "ngưng hoạt động thật": Page bị loại khỏi KPI/nhắc việc' })
    @IsOptional()
    @IsBoolean()
    isBlocking?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}

export class UpdateFanpageHealthStatusDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Tên tình trạng không được để trống' })
    @Length(1, 50, { message: 'Tên tình trạng tối đa 50 ký tự' })
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải có dạng #RRGGBB' })
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isBlocking?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}