import { IsString, IsNotEmpty, Length, IsOptional, IsInt, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkGroupDto {
  @ApiProperty({ example: 1, description: 'ID của LinkCategory (nền tảng) mà group này thuộc về' })
  @IsInt()
  @Type(() => Number)
  categoryId: number;

  @ApiProperty({ example: 'Nhóm Zalo Sales Hà Nội', description: 'Tên nhóm (duy nhất trong cùng 1 category)' })
  @IsString()
  @IsNotEmpty({ message: 'Tên nhóm là bắt buộc' })
  @Length(1, 255, { message: 'Tên nhóm tối đa 255 ký tự' })
  name: string;

  @ApiProperty({ example: 'https://zalo.me/g/abcxyz', description: 'URL riêng của nhóm này (mỗi nhóm 1 URL khác nhau)' })
  @IsUrl({}, { message: 'URL không hợp lệ' })
  @Length(1, 500, { message: 'URL tối đa 500 ký tự' })
  url: string;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị trong category, mặc định 0' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 3, description: 'ID của "Quản lý chính" cho nhóm này (chỉ admin được set)' })
  @IsOptional()
  @IsInt({ message: 'ID Quản lý chính phải là số nguyên' })
  @Type(() => Number)
  primaryManagerId?: number | null;
}