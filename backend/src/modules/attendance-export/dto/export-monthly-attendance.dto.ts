import { Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  Matches,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';

// Khớp DayMark ở AttendanceMonthlyTab.tsx (frontend) - đây là "nguồn xác
// thực duy nhất" cho việc suy luận ký hiệu từng ô (xem giải thích kiến trúc
// ở đầu attendance-export.service.ts: BE KHÔNG tự tính lại, chỉ nhận nguyên
// những gì FE đang hiển thị).
const VALID_MARKS = ['X', 'X/2', '1/2K', 'P', 'KL'] as const;

export class MonthlyDayEntryDto {
  @IsInt()
  @Min(1)
  @Max(31)
  day: number;

  @IsIn(VALID_MARKS)
  mark: (typeof VALID_MARKS)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}

export class MonthlyLateEarlyEntryDto {
  @IsString()
  dateStr: string; // "DD/MM"

  @IsString()
  time: string; // "HH:mm"

  @IsInt()
  @Min(0)
  minutes: number;
}

export class MonthlyRowDto {
  @IsString()
  userName: string;

  @IsString()
  departmentName: string;

  @IsArray()
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => MonthlyDayEntryDto)
  days: MonthlyDayEntryDto[];

  @IsNumber()
  actualWorkDays: number;

  @IsNumber()
  paidLeaveDays: number;

  @IsNumber()
  unpaidLeaveDays: number;

  @IsOptional()
  @IsNumber()
  annualLeaveBalance?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonthlyLateEarlyEntryDto)
  lateEntries: MonthlyLateEarlyEntryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonthlyLateEarlyEntryDto)
  earlyEntries: MonthlyLateEarlyEntryDto[];
}

export class ExportMonthlyAttendanceDto {
  // "YYYY-MM" - dùng để tính số ngày trong tháng (daysInMonth) và tên file.
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month phải đúng định dạng YYYY-MM',
  })
  month: string;

  // Giới hạn hợp lý cho 1 lần export (vài trăm nhân viên) - tránh 1 payload
  // JSON khổng lồ vô tình/cố ý gửi lên làm treo tiến trình dựng file Excel.
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MonthlyRowDto)
  rows: MonthlyRowDto[];
}
