import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsDateString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PeriodType } from '../../../common/enums/period-type.enum';

/**
 * CreatePeriodicTaskDto - tạo 1 Công việc định kỳ THỦ CÔNG (không có
 * recurrence engine, xem PLAN mục 1.1). `periodStartDate`/`periodEndDate`
 * BẮT BUỘC truyền tường minh - CỐ Ý không tự suy ra biên tuần/tháng/năm
 * trong code (xem JSDoc `PeriodicTask` entity).
 */
export class CreatePeriodicTaskDto {
  @ApiProperty({ example: 'Gọi lại 5 khách tiềm năng' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  @MaxLength(255, { message: 'Tiêu đề tối đa 255 ký tự' })
  title: string;

  @ApiPropertyOptional({ example: 'Ưu tiên nhóm khách đã nạp tiền tháng trước' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string;

  @ApiProperty({ enum: PeriodType, example: PeriodType.DAILY })
  @IsEnum(PeriodType, { message: 'periodType phải là 1 trong: daily, weekly, monthly, yearly' })
  periodType: PeriodType;

  @ApiProperty({ example: '2026-09-14', description: 'Ngày bắt đầu kỳ hạn (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'periodStartDate phải đúng định dạng ngày YYYY-MM-DD' })
  periodStartDate: string;

  @ApiProperty({ example: '2026-09-14', description: 'Ngày kết thúc kỳ hạn (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'periodEndDate phải đúng định dạng ngày YYYY-MM-DD' })
  periodEndDate: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID trạng thái (periodic_task_statuses.id) - bỏ trống sẽ dùng trạng thái mặc định "Chưa hoàn thành"',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'statusId phải là số nguyên' })
  statusId?: number;

  @ApiProperty({ example: 5, description: 'Người phụ trách chính (bắt buộc)' })
  @Type(() => Number)
  @IsInt({ message: 'primaryAssigneeId phải là số nguyên' })
  primaryAssigneeId: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Phòng ban - bỏ trống sẽ auto-fill theo phòng ban của primaryAssigneeId lúc tạo (xem PLAN mục 2.10)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'departmentId phải là số nguyên' })
  departmentId?: number;

  @ApiPropertyOptional({ example: 'Nhắc khách kiểm tra lại số dư trước khi gọi' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  note?: string;

  @ApiPropertyOptional({
    example: '#FF5733',
    description: 'Màu Task (hex 6 ký tự, dùng để hiển thị Card/Kanban/Calendar sau này) - không bắt buộc',
  })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color phải đúng định dạng hex 6 ký tự, ví dụ #FF5733' })
  color?: string;
}