import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStorageLimitDto {
  @ApiProperty({ example: 50, description: 'Hạn mức MỀM (GB) - chỉ để hiển thị %, KHÔNG chặn upload nếu vượt' })
  @IsInt()
  @Min(1)
  softLimitGb: number;
}
