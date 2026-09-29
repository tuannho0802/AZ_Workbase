import { PartialType } from '@nestjs/swagger';
import { CreateUtmDto } from './create-utm.dto';

// Tên/visibility chỉ Quản lý chính hoặc scope rộng được đổi; mô tả/màu cả Quản lý phụ - kiểm ở service.
export class UpdateUtmDto extends PartialType(CreateUtmDto) {}
