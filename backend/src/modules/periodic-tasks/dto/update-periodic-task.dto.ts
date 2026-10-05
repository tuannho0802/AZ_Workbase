import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreatePeriodicTaskDto } from './create-periodic-task.dto';
import { CHECKLIST_SYNC_ACTIONS } from '../helpers/task-status.helper';
import type { ChecklistSyncAction } from '../helpers/task-status.helper';

// ⚠️ Khác `UpdateCustomerStatusDto` (khoá cứng `code`) - Ở đây MỌI field kể
// cả `departmentId` đều sửa tự do sau khi tạo (đã chốt PLAN mục 2.10, không
// khoá cứng theo primaryAssigneeId lúc tạo) nên PartialType đủ, không cần
// OmitType field nào.
export class UpdatePeriodicTaskDto extends PartialType(CreatePeriodicTaskDto) {
  @ApiPropertyOptional({
    enum: CHECKLIST_SYNC_ACTIONS,
    description:
      'Chỉ dùng kèm `statusId` SAU KHI người dùng xác nhận Guard checklist (BE trả 409 `CHECKLIST_GUARD` nếu thiếu): ' +
      '`tick_all` = tick hết checklist khi đẩy Task sang trạng thái hoàn thành; `untick_all` = bỏ tick hết khi đưa Task về To-do.',
  })
  @IsOptional()
  @IsIn(CHECKLIST_SYNC_ACTIONS, { message: 'checklistSync phải là "tick_all" hoặc "untick_all"' })
  checklistSync?: ChecklistSyncAction;
}
