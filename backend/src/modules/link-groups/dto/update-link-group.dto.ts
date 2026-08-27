import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLinkGroupDto } from './create-link-group.dto';

// categoryId KHÔNG cho sửa qua update (nếu cần chuyển nhóm sang category
// khác, tạo mới rồi xoá nhóm cũ - tránh phức tạp hoá logic đổi FK giữa
// chừng trong khi đã có thể có membership gắn vào group đó).
export class UpdateLinkGroupDto extends PartialType(
  OmitType(CreateLinkGroupDto, ['categoryId'] as const),
) {}
