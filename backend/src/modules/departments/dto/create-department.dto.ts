import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Sales', description: 'Tên phòng ban' })
  @IsNotEmpty({ message: 'Tên phòng ban không được để trống' })
  @IsString({ message: 'Tên phòng ban phải là chuỗi' })
  name: string;

  @ApiProperty({ example: 'Phòng Kinh doanh', required: false })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string;

  @ApiProperty({
    example: '#1890ff',
    required: false,
    description: 'Mã màu hex hiển thị Tag phòng ban ngoài FE - để trống sẽ dùng màu mặc định',
  })
  @IsOptional()
  @IsString({ message: 'Màu phải là chuỗi' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Màu phải là mã hex hợp lệ dạng #RRGGBB (vd #1890ff)',
  })
  color?: string;
}