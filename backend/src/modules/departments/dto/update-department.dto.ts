import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateDepartmentDto } from './create-department.dto';
import { IsOptional, IsBoolean, IsInt, IsArray, ArrayUnique } from 'class-validator';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái hoạt động phải là boolean' })
  isActive?: boolean;

  @ApiProperty({
    example: [5, 8],
    required: false,
    type: [Number],
    description:
      'Danh sách ĐẦY ĐỦ id user (role phải là Admin/Assistant/Manager, đang active) được ' +
      'gán quản lý phòng ban này - THAY THẾ TOÀN BỘ danh sách cũ (không phải thêm/bớt). ' +
      'Là nguồn xác định phạm vi "Manager theo phòng ban" dùng bởi CustomerAccessHelper/ ' +
      'UsersAccessHelper/LeaveRequestsService/ZkDeviceService (bảng department_managers, ' +
      'nhiều-nhiều - 1 phòng ban có thể có NHIỀU Manager/Assistant cùng lúc). ' +
      'Truyền mảng rỗng [] để gỡ hết Manager hiện tại. Không truyền field này (undefined) ' +
      'nghĩa là KHÔNG đụng gì tới danh sách Manager đang có.',
  })
  @IsOptional()
  @IsArray({ message: 'managerUserIds phải là mảng số nguyên' })
  @ArrayUnique({ message: 'managerUserIds không được có id trùng lặp' })
  @IsInt({ each: true, message: 'Mỗi phần tử trong managerUserIds phải là số nguyên' })
  managerUserIds?: number[];
}