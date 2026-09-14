import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePeriodicTaskStatusDto } from './create-periodic-task-status.dto';

// ⚠️ `code` bất biến sau khi tạo (giá trị THẬT được `periodic_tasks.status_id`
// tham chiếu qua FK) - KHÔNG cho sửa qua endpoint update, mirror
// `UpdateCustomerStatusDto`/`UpdateLeaveTypeDto`.
export class UpdatePeriodicTaskStatusDto extends PartialType(
  OmitType(CreatePeriodicTaskStatusDto, ['code'] as const),
) {}
