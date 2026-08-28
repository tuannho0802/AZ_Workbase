import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateDepartmentDto } from './create-department.dto';
import { IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái hoạt động phải là boolean' })
  isActive?: boolean;

  @ApiProperty({
    example: 5,
    required: false,
    nullable: true,
    description:
      'ID user (role phải là MANAGER, đang active) được gán quản lý phòng ban này - ' +
      'là nguồn xác định phạm vi "Manager theo phòng ban" dùng bởi CustomerAccessHelper ' +
      'và các module khác. Truyền null để gỡ bỏ (phòng ban tạm không có Manager quản lý).',
  })
  @IsOptional()
  @IsInt({ message: 'managerUserId phải là số nguyên' })
  managerUserId?: number | null;
}