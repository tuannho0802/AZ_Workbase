import { Type } from 'class-transformer';
import { IsArray, ValidateNested, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PermissionScope } from '../../../database/entities/role-permission.entity';

class RolePermissionEntryDto {
  @ApiProperty({ example: 'customers.assign' })
  @IsString()
  permissionKey: string;

  @ApiProperty({
    required: false,
    enum: PermissionScope,
    description: 'Bắt buộc có giá trị nếu permission.supportsScope=true, ngược lại phải để trống/null',
  })
  @IsOptional()
  @IsIn(Object.values(PermissionScope))
  scope?: PermissionScope | null;
}

export class UpdateRolePermissionsDto {
  // Danh sách NÀY LÀ TOÀN BỘ ma trận quyền mới của role (thay thế hoàn
  // toàn, không phải patch từng dòng) - permission nào không có mặt trong
  // mảng này coi như bị BỎ khỏi role. Thiết kế "replace toàn bộ" thay vì
  // "add/remove từng cái" để UI (checkbox matrix) chỉ cần gửi đúng trạng
  // thái đang tick, không cần tự tính diff.
  @ApiProperty({ type: [RolePermissionEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionEntryDto)
  permissions: RolePermissionEntryDto[];
}
