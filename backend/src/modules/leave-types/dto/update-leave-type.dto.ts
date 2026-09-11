import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLeaveTypeDto } from './create-leave-type.dto';

// ⚠️ `code` bất biến sau khi tạo (giá trị này được lưu thẳng vào cột
// leave_requests.leave_type của các đơn đang dùng nó) - KHÔNG cho sửa qua
// endpoint update, đúng quy ước đã áp dụng cho `UpdateCustomerStatusDto`.
export class UpdateLeaveTypeDto extends PartialType(
  OmitType(CreateLeaveTypeDto, ['code'] as const),
) {}
