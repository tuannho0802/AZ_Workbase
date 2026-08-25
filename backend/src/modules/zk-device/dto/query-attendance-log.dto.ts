import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsIn,
    IsDateString,
    Min,
} from 'class-validator';

export class QueryAttendanceLogDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;

    // Lọc theo nhân viên đã map trong hệ thống (users.id) - KHÔNG phải deviceUserId.
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    userId?: number;

    // 'matched': chỉ log đã khớp được nhân viên hệ thống.
    // 'unmatched': chỉ log CHƯA khớp (deviceUserId lạ, chưa ai map) - dùng để
    // admin rà soát rồi vào màn Mapping gán tiếp.
    @IsOptional()
    @IsIn(['matched', 'unmatched'])
    matched?: 'matched' | 'unmatched';

    @IsOptional()
    @IsDateString()
    from?: string; // ISO date, lọc recordTime >= from (00:00:00)

    @IsOptional()
    @IsDateString()
    to?: string; // ISO date, lọc recordTime <= to (23:59:59)
}