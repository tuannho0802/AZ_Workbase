import { PartialType } from '@nestjs/swagger';
import { CreateGuideDto } from './create-guide.dto';

/** Mọi trường tuỳ chọn. `roleIds: []` = bỏ giới hạn role (mọi role xem được); không gửi `roleIds` = giữ nguyên. */
export class UpdateGuideDto extends PartialType(CreateGuideDto) {}
