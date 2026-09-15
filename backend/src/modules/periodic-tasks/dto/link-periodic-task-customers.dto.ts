import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, ArrayMaxSize, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * LinkPeriodicTaskCustomersDto - body của `POST /periodic-tasks/:id/customers`
 * (PLAN mục 5, 2.4) - mirror `BulkAssignDto.customerIds` của module customers.
 */
export class LinkPeriodicTaskCustomersDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Danh sách ID khách hàng cần gắn vào Công việc (tối đa 100/lần)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 khách hàng' })
  @ArrayMaxSize(100, { message: 'Chỉ được gắn tối đa 100 khách hàng mỗi lần' })
  @IsInt({ each: true })
  @Type(() => Number)
  customerIds: number[];
}
