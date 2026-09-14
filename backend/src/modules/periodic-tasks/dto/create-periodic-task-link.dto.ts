import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * CreatePeriodicTaskLinkDto - body của `POST /periodic-tasks/:id/links`
 * (`:id` = child, `parentTaskId` = cha muốn gán) - xem PLAN mục 5, 2.2.
 */
export class CreatePeriodicTaskLinkDto {
  @ApiProperty({ example: 12, description: 'ID Task cha muốn gán (phải có period_type "lớn kỳ hạn hơn" Task con)' })
  @Type(() => Number)
  @IsInt({ message: 'parentTaskId phải là số nguyên' })
  parentTaskId: number;
}
