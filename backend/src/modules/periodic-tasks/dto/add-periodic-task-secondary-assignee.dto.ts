import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * AddPeriodicTaskSecondaryAssigneeDto - body của
 * `POST /periodic-tasks/:id/secondary-assignees` (PLAN mục 5, 2.5).
 */
export class AddPeriodicTaskSecondaryAssigneeDto {
  @ApiProperty({ example: 7, description: 'ID nhân viên muốn thêm làm phụ trách phụ' })
  @Type(() => Number)
  @IsInt({ message: 'userId phải là số nguyên' })
  userId: number;
}
