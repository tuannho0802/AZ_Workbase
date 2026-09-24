import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** `GET /periodic-tasks/trash` - phân trang server-side + tìm theo tiêu đề. */
export class PeriodicTaskTrashFiltersDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Tối đa 100' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Tìm theo tiêu đề Công việc' })
  @IsOptional()
  @IsString()
  search?: string;
}

/** `PATCH /periodic-tasks/trash/restore` - khôi phục các Task đã chọn (cùng dạng body với xoá vĩnh viễn). */
export class RestorePeriodicTasksDto {
  @ApiProperty({ example: [1, 2, 3] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];
}

/** `DELETE /periodic-tasks/trash/bulk` - xoá vĩnh viễn các Task đã chọn. */
export class HardDeletePeriodicTasksDto {
  @ApiProperty({ example: [1, 2, 3] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];
}
