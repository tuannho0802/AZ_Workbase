import { Type } from 'class-transformer';
import { IsArray, ValidateNested, IsString, IsBoolean, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UiVisibilityRuleEntryDto {
  @ApiProperty({ example: 'field:sales_assignment' })
  @IsString()
  elementKey: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  visible: boolean;
}

/**
 * Style "replace toàn bộ" GIỐNG HỆT `UpdateRolePermissionsDto` - mảng NÀY
 * LÀ TOÀN BỘ rule mới ở ĐÚNG 1 SCOPE (global HOẶC 1 phòng ban HOẶC 1 vị
 * trí cụ thể, xác định bởi `departmentId`/`positionId`, KHÔNG được truyền cả
 * hai cùng lúc - validate ở `UiVisibilityService`). Rule nào không có mặt
 * trong mảng bị XOÁ khỏi scope đó (coi như "không cấu hình gì" - mặc định
 * hiện, đúng thiết kế opt-out).
 */
export class UpdateUiVisibilityRulesDto {
  @ApiProperty({ example: 'customers', description: 'Resource cố định - hiện chỉ có "customers"' })
  @IsString()
  resource: string;

  @ApiProperty({ required: false, description: 'Set nếu đây là override theo Phòng ban - KHÔNG được set cùng lúc với positionId' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiProperty({ required: false, description: 'Set nếu đây là override theo Vị trí - KHÔNG được set cùng lúc với departmentId' })
  @IsOptional()
  @IsInt()
  positionId?: number;

  @ApiProperty({ type: [UiVisibilityRuleEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UiVisibilityRuleEntryDto)
  rules: UiVisibilityRuleEntryDto[];
}
