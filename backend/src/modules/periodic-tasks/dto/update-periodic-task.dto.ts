import { PartialType } from '@nestjs/swagger';
import { CreatePeriodicTaskDto } from './create-periodic-task.dto';

// ⚠️ Khác `UpdateCustomerStatusDto` (khoá cứng `code`) - Ở đây MỌI field kể
// cả `departmentId` đều sửa tự do sau khi tạo (đã chốt PLAN mục 2.10, không
// khoá cứng theo primaryAssigneeId lúc tạo) nên PartialType đủ, không cần
// OmitType field nào.
export class UpdatePeriodicTaskDto extends PartialType(CreatePeriodicTaskDto) {}
