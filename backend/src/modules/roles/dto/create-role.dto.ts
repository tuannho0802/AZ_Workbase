import { IsString, IsNotEmpty, Length, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  // Bất biến sau khi tạo (xem role.entity.ts) - CHỈ chữ thường/số/gạch dưới
  // để an toàn khi dùng làm giá trị FK trong users.role và trong code (nếu
  // sau này cần so sánh literal ở đâu đó).
  @ApiProperty({ example: 'mkt_manager', description: 'Định danh nội bộ, bất biến sau khi tạo - chỉ chữ thường/số/gạch dưới' })
  @IsString()
  @IsNotEmpty({ message: 'Mã role là bắt buộc' })
  @Length(2, 50, { message: 'Mã role từ 2-50 ký tự' })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'Mã role chỉ gồm chữ thường, số, gạch dưới, bắt đầu bằng chữ (vd "mkt_manager")',
  })
  code: string;

  @ApiProperty({ example: 'Trưởng phòng Marketing' })
  @IsString()
  @IsNotEmpty({ message: 'Tên role là bắt buộc' })
  @Length(1, 100, { message: 'Tên role tối đa 100 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Quản lý team Marketing, xem báo cáo doanh số' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;
}
