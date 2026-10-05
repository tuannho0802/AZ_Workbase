import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const GUIDE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const GUIDE_SLUG_MAX = 100;
export const GUIDE_CONTENT_MAX = 200_000;

export const GUIDE_PERMISSIONS_MAX = 30;
export const GUIDE_PERMISSION_KEY_REGEX = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export class CreateGuideDto {
  @ApiProperty({ example: 'Cách thêm khách hàng mới' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  @MaxLength(200, { message: 'Tiêu đề tối đa 200 ký tự' })
  title: string;

  @ApiPropertyOptional({
    example: 'them-khach-hang-moi',
    description: 'Chữ thường/số/gạch ngang. Bỏ trống = tự sinh từ tiêu đề (bỏ dấu tiếng Việt)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(GUIDE_SLUG_MAX, { message: `Slug tối đa ${GUIDE_SLUG_MAX} ký tự` })
  @Matches(GUIDE_SLUG_REGEX, { message: 'Slug chỉ gồm chữ thường, số và dấu gạch ngang (vd: them-khach-hang)' })
  slug?: string;

  @ApiProperty({ description: 'Nội dung Markdown' })
  @IsString({ message: 'Nội dung phải là chuỗi' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @MaxLength(GUIDE_CONTENT_MAX, { message: `Nội dung tối đa ${GUIDE_CONTENT_MAX} ký tự` })
  content: string;

  @ApiPropertyOptional({ example: 0, description: 'Số nhỏ hiện trước' })
  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'isPublished phải là true/false' })
  isPublished?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['customers.assign'],
    description:
      'Permission key người xem phải có TẤT CẢ (AND với role/vị trí/phòng ban). Rỗng/bỏ trống = không yêu cầu. ' +
      'PATCH: không gửi = giữ nguyên, [] = bỏ yêu cầu. Mỗi key phải có trong bảng permissions',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GUIDE_PERMISSIONS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Matches(GUIDE_PERMISSION_KEY_REGEX, { each: true, message: 'Permission key không hợp lệ (dạng resource.action, vd customers.assign)' })
  requiredPermissions?: string[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'ID các role được xem. Mảng rỗng/bỏ trống = mọi role đăng nhập đều xem được',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  roleIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'ID các vị trí (positions) được xem. Rỗng/bỏ trống = không giới hạn theo vị trí (AND với role/phòng ban)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  positionIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'ID các phòng ban được xem. Rỗng/bỏ trống = không giới hạn theo phòng ban (AND với role/vị trí)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  departmentIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description:
      'ID các role bị LOẠI TRỪ (không được xem, thắng "được xem"). Rỗng/bỏ trống = không loại trừ ai. ' +
      'PATCH: không gửi = giữ nguyên, [] = bỏ loại trừ. Không được trùng với danh sách "được xem" cùng chiều',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  excludedRoleIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description:
      'ID các vị trí bị LOẠI TRỪ (không được xem, thắng "được xem"). Rỗng/bỏ trống = không loại trừ ai. ' +
      'PATCH: không gửi = giữ nguyên, [] = bỏ loại trừ. Không được trùng với danh sách "được xem" cùng chiều',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  excludedPositionIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description:
      'ID các phòng ban bị LOẠI TRỪ (không được xem, thắng "được xem"). Rỗng/bỏ trống = không loại trừ ai. ' +
      'PATCH: không gửi = giữ nguyên, [] = bỏ loại trừ. Không được trùng với danh sách "được xem" cùng chiều',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  excludedDepartmentIds?: number[];
}
