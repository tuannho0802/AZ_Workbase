import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// Không kế thừa CreateAssignmentGroupDto vì `key` bất biến sau khi tạo
// (giống UpdatePositionDto không cho sửa `code`) - tách DTO riêng cho rõ ràng.
export class UpdateAssignmentGroupDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    type: [Number],
    description: 'Ghi đè TOÀN BỘ danh sách department_id - BẮT BUỘC >= 1 phần tử',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 phòng ban' })
  @IsInt({ each: true })
  departmentIds: number[];

  @ApiProperty({
    type: [Number],
    required: false,
    description: 'Ghi đè TOÀN BỘ danh sách position_id - để trống/không truyền = bỏ lọc theo vị trí',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  positionIds?: number[];

  @ApiProperty({
    example: '#1890ff',
    required: false,
    description: 'Mã màu hex hiển thị Tag nhóm phụ trách ngoài FE',
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ dạng #RRGGBB (vd #1890ff)' })
  color?: string;
}