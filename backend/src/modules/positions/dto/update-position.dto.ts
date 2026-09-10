import { ApiProperty, PartialType, OmitType } from '@nestjs/swagger';
import { CreatePositionDto } from './create-position.dto';

// ⚠️ `code` bất biến sau khi tạo (giống RoleEntity.code) - KHÔNG cho sửa qua
// endpoint update, đúng quy ước đã ghi trong PLAN mục 3.1.
export class UpdatePositionDto extends PartialType(
  OmitType(CreatePositionDto, ['code'] as const),
) {}
