import { IsString, IsNotEmpty, Length, IsOptional, IsInt, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateFanpagePostTypeDto {
    @ApiProperty({ example: 'Reels' })
    @IsString()
    @IsNotEmpty({ message: 'Tên loại bài là bắt buộc' })
    @Length(1, 50, { message: 'Tên loại bài tối đa 50 ký tự' })
    name: string;

    @ApiPropertyOptional({ example: '#722ed1' })
    @IsOptional()
    @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải có dạng #RRGGBB' })
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    sortOrder?: number;
}

export class UpdateFanpagePostTypeDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Tên loại bài không được để trống' })
    @Length(1, 50, { message: 'Tên loại bài tối đa 50 ký tự' })
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