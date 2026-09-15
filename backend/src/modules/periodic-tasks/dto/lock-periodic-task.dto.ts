import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * LockPeriodicTaskDto - Phase 5 (PLAN mục 2.9, 3): body của
 * `PATCH /periodic-tasks/:id/lock`. `lockNote` optional - KHÔNG bắt buộc lý
 * do khi khoá (đã chốt PLAN mục 2.9). `unlock` KHÔNG có DTO riêng (không
 * nhận body - xem `PeriodicTasksController.unlock()`).
 */
export class LockPeriodicTaskDto {
  @ApiPropertyOptional({ example: 'Đã đối soát xong, khoá để tránh sửa nhầm' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lockNote?: string;
}
