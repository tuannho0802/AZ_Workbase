import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AddContentStaffDto {
  @ApiProperty({ example: 5, description: 'ID của user sẽ được thêm làm Nhân viên Content của nhóm này' })
  @IsInt({ message: 'userId phải là số nguyên' })
  @Type(() => Number)
  userId: number;
}
