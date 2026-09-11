import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CreateCustomerStatusDto {
  @ApiProperty({
    example: 'callback_later',
    description:
      'Mã bất biến sau khi tạo, là giá trị THẬT được lưu vào customers.status - chỉ chữ thường/số/gạch dưới',
  })
  @IsNotEmpty({ message: 'Mã trạng thái không được để trống' })
  @IsString({ message: 'Mã trạng thái phải là chuỗi' })
  @MaxLength(50, { message: 'Mã trạng thái tối đa 50 ký tự' })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Mã trạng thái chỉ được chứa chữ thường, số và dấu gạch dưới (vd: callback_later)',
  })
  code: string;

  @ApiProperty({ example: 'Gọi lại sau', description: 'Tên hiển thị' })
  @IsNotEmpty({ message: 'Tên trạng thái không được để trống' })
  @IsString({ message: 'Tên trạng thái phải là chuỗi' })
  @MaxLength(100, { message: 'Tên trạng thái tối đa 100 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Khách hẹn gọi lại vào tuần sau' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    example: '#1890ff',
    description: 'Mã màu hex hiển thị Tag trạng thái ngoài FE, để trống sẽ dùng màu mặc định',
  })
  @IsOptional()
  @IsString({ message: 'Màu phải là chuỗi' })
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ, vd #1890ff hoặc #fff' })
  color?: string;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị (nhỏ hơn hiện trước), mặc định 0' })
  @IsOptional()
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  @Type(() => Number)
  sortOrder?: number;
}
