import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export class CreateAssignmentGroupDto {
  @ApiProperty({
    example: 'content_staff',
    description: 'Mã bất biến sau khi tạo, chỉ chữ thường/số/gạch dưới - dùng cho GET /assignment-groups/:key/users',
  })
  @IsNotEmpty({ message: 'Key không được để trống' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, { message: 'Key chỉ được chứa chữ thường, số và dấu gạch dưới' })
  key: string;

  @ApiProperty({ example: 'Content phụ trách' })
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    type: [Number],
    description: 'Danh sách department_id - BẮT BUỘC >= 1 phần tử để config có hiệu lực',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 phòng ban' })
  @IsInt({ each: true })
  departmentIds: number[];

  @ApiProperty({
    type: [Number],
    required: false,
    description: 'Danh sách position_id - TUỲ CHỌN, để trống = không lọc theo vị trí',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  positionIds?: number[];

  @ApiProperty({
    example: '#1890ff',
    required: false,
    description: 'Mã màu hex hiển thị Tag nhóm phụ trách ngoài FE - để trống sẽ dùng màu mặc định',
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ dạng #RRGGBB (vd #1890ff)' })
  color?: string;
}