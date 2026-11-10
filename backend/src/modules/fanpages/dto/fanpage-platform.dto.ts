import { IsString, IsNotEmpty, Length, IsOptional, IsInt, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateFanpagePlatformDto {
    @ApiProperty({ example: 'Facebook' })
    @IsString()
    @IsNotEmpty({ message: 'Tên nền tảng là bắt buộc' })
    @Length(1, 50, { message: 'Tên nền tảng tối đa 50 ký tự' })
    name: string;

    @ApiPropertyOptional({ example: '#1877f2' })
    @IsOptional()
    @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải có dạng #RRGGBB' })
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}

export class UpdateFanpagePlatformDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Tên nền tảng không được để trống' })
    @Length(1, 50, { message: 'Tên nền tảng tối đa 50 ký tự' })
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải có dạng #RRGGBB' })
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}