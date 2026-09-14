import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, IsBoolean, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CreatePeriodicTaskStatusDto {
  @ApiProperty({
    example: 'in_review',
    description: 'Mã bất biến sau khi tạo - chỉ chữ thường/số/gạch dưới',
  })
  @IsNotEmpty({ message: 'Mã trạng thái không được để trống' })
  @IsString({ message: 'Mã trạng thái phải là chuỗi' })
  @MaxLength(50, { message: 'Mã trạng thái tối đa 50 ký tự' })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Mã trạng thái chỉ được chứa chữ thường, số và dấu gạch dưới (vd: in_review)',
  })
  code: string;

  @ApiProperty({ example: 'Đang xem xét', description: 'Tên hiển thị' })
  @IsNotEmpty({ message: 'Tên trạng thái không được để trống' })
  @IsString({ message: 'Tên trạng thái phải là chuỗi' })
  @MaxLength(100, { message: 'Tên trạng thái tối đa 100 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Đang chờ Manager xem xét trước khi tính là xong' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;

  @ApiPropertyOptional({ example: '#1890ff', description: 'Mã màu hex hiển thị Tag, để trống dùng màu mặc định' })
  @IsOptional()
  @IsString({ message: 'Màu phải là chuỗi' })
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ, vd #1890ff hoặc #fff' })
  color?: string;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị (nhỏ hơn hiện trước), mặc định 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  sortOrder?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Trạng thái này có tính vào TỬ SỐ % rollup không (PLAN mục 2.3) - mặc định false',
  })
  @IsOptional()
  @IsBoolean({ message: 'isDoneState phải là boolean' })
  isDoneState?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Trạng thái này có bị loại khỏi CẢ tử số lẫn mẫu số % rollup không - mặc định false',
  })
  @IsOptional()
  @IsBoolean({ message: 'isExcludedFromRollup phải là boolean' })
  isExcludedFromRollup?: boolean;
}
