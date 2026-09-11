import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCustomerStatusDto } from './create-customer-status.dto';

// ⚠️ `code` bất biến sau khi tạo (giá trị này được lưu thẳng vào cột
// customers.status của các customer đang dùng nó) - KHÔNG cho sửa qua
// endpoint update, đúng quy ước đã áp dụng cho `UpdatePositionDto`.
export class UpdateCustomerStatusDto extends PartialType(
  OmitType(CreateCustomerStatusDto, ['code'] as const),
) {}
