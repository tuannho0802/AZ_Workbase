import { IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Role } from '../../../common/enums/role.enum';

export class ApproveUserDto {
  @ApiPropertyOptional({
    enum: Role,
    description: 'Đổi role khi duyệt (để trống thì giữ nguyên EMPLOYEE mặc định lúc đăng ký)',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Đổi phòng ban khi duyệt (để trống thì giữ nguyên lúc đăng ký)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;
}
