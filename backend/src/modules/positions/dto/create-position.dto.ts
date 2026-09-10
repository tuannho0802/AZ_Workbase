import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, Matches, MaxLength } from 'class-validator';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export class CreatePositionDto {
  @ApiProperty({
    example: 'content',
    description:
      'Mã bất biến sau khi tạo (giống RoleEntity.code) - chỉ chữ thường/số/gạch dưới, dùng làm định danh code',
  })
  @IsNotEmpty({ message: 'Mã vị trí không được để trống' })
  @IsString({ message: 'Mã vị trí phải là chuỗi' })
  @MaxLength(50, { message: 'Mã vị trí tối đa 50 ký tự' })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Mã vị trí chỉ được chứa chữ thường, số và dấu gạch dưới (vd: content, hr, director)',
  })
  code: string;

  @ApiProperty({ example: 'Content', description: 'Tên hiển thị' })
  @IsNotEmpty({ message: 'Tên vị trí không được để trống' })
  @IsString({ message: 'Tên vị trí phải là chuỗi' })
  @MaxLength(100, { message: 'Tên vị trí tối đa 100 ký tự' })
  name: string;

  @ApiProperty({
    example: 1,
    required: false,
    nullable: true,
    description:
      'Phòng ban GỢI Ý (chỉ để nhóm hiển thị trong UI quản lý) - KHÔNG ràng buộc user phải thuộc phòng ban này mới chọn được Position',
  })
  @IsOptional()
  @IsInt({ message: 'departmentId phải là số nguyên' })
  departmentId?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;

  @ApiProperty({
    example: '#1890ff',
    required: false,
    description: 'Mã màu hex hiển thị Tag vị trí ngoài FE - để trống sẽ dùng màu mặc định',
  })
  @IsOptional()
  @IsString({ message: 'Màu phải là chuỗi' })
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ dạng #RRGGBB (vd #1890ff)' })
  color?: string;
}