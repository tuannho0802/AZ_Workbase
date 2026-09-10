import { IsString, IsOptional, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// CỐ TÌNH không có field `code` - code bất biến sau khi tạo (xem
// role.entity.ts và create-role.dto.ts). Muốn đổi "mã" 1 role, phải xoá
// role đó (nếu chưa gán cho user nào) và tạo role mới.
export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Trưởng phòng Marketing' })
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'Tên role tối đa 100 ký tự' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiPropertyOptional({
    example: '#1890ff',
    description: 'Mã màu hex hiển thị Tag role ngoài FE',
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ dạng #RRGGBB (vd #1890ff)' })
  color?: string;
}