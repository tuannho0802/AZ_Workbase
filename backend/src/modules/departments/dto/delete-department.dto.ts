import { IsInt, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteDepartmentDto {
  @ApiProperty({
    required: false,
    description:
      'ID phòng ban đích để di dời TOÀN BỘ user đang thuộc phòng ban sắp xoá sang. ' +
      'Bắt buộc phải truyền nếu phòng ban sắp xoá còn ít nhất 1 user - nếu không sẽ báo lỗi ' +
      'thay vì tự ý chọn hộ, tránh chuyển nhầm ai đó sang phòng ban không mong muốn.',
  })
  @IsOptional()
  @IsInt({ message: 'moveUsersToDepartmentId phải là số nguyên' })
  moveUsersToDepartmentId?: number;
}
