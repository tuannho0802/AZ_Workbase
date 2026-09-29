import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Dùng chung cho thêm Quản lý phụ và chuyển Quản lý chính. */
export class UtmUserIdDto {
  @ApiProperty({ example: 5, description: 'ID user' })
  @IsInt({ message: 'userId phải là số nguyên' })
  @Type(() => Number)
  userId: number;
}
