import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Sales', description: 'Tên phòng ban' })
  @IsNotEmpty({ message: 'Tên phòng ban không được để trống' })
  @IsString({ message: 'Tên phòng ban phải là chuỗi' })
  name: string;

  @ApiProperty({ example: 'Phòng Kinh doanh', required: false })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string;
}
