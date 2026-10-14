import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { SECURITY_AUDIT_ACTIONS } from '../security-audit';
import { SECURITY_CONFIG_LIMITS } from '../security-config.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class GetSecurityEventsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Tối đa 100/trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: SECURITY_AUDIT_ACTIONS })
  @IsOptional()
  @IsIn([...SECURITY_AUDIT_ACTIONS])
  action?: string;

  @ApiPropertyOptional({ description: 'Lọc IP theo tiền tố (vd 113.161.)' })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ip?: string;

  @ApiPropertyOptional({ description: 'Tìm theo email thử / email hoặc tên tài khoản' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (theo ngày VN, gồm cả ngày này)' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'fromDate phải dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (theo ngày VN, gồm cả ngày này)' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'toDate phải dạng YYYY-MM-DD' })
  toDate?: string;
}

const L = SECURITY_CONFIG_LIMITS;
const range = (k: keyof typeof L) => `${L[k][0]}–${L[k][1]}`;

/** Mọi field tuỳ chọn; ngoài khoảng hợp lệ -> 400 (không âm thầm kẹp khi Admin chủ động sửa). */
export class UpdateSecurityConfigDto {
  @ApiPropertyOptional({ description: `Sai bao nhiêu lần thì khoá tài khoản (${range('accountMaxFailedAttempts')})` })
  @IsOptional() @IsInt() @Min(L.accountMaxFailedAttempts[0]) @Max(L.accountMaxFailedAttempts[1])
  accountMaxFailedAttempts?: number;

  @ApiPropertyOptional({ description: `Khoá tài khoản (phút) (${range('accountLockMinutes')})` })
  @IsOptional() @IsInt() @Min(L.accountLockMinutes[0]) @Max(L.accountLockMinutes[1])
  accountLockMinutes?: number;

  @ApiPropertyOptional({ description: `Sai bao nhiêu lần trên 1 IP thì khoá IP (${range('ipMaxFailedAttempts')})` })
  @IsOptional() @IsInt() @Min(L.ipMaxFailedAttempts[0]) @Max(L.ipMaxFailedAttempts[1])
  ipMaxFailedAttempts?: number;

  @ApiPropertyOptional({ description: `Cửa sổ đếm sai theo IP (phút) (${range('ipWindowMinutes')})` })
  @IsOptional() @IsInt() @Min(L.ipWindowMinutes[0]) @Max(L.ipWindowMinutes[1])
  ipWindowMinutes?: number;

  @ApiPropertyOptional({ description: `Khoá IP (phút) (${range('ipLockMinutes')})` })
  @IsOptional() @IsInt() @Min(L.ipLockMinutes[0]) @Max(L.ipLockMinutes[1])
  ipLockMinutes?: number;

  @ApiPropertyOptional({ description: `Hạn giữ sự kiện bảo mật (ngày) (${range('securityEventRetentionDays')})` })
  @IsOptional() @IsInt() @Min(L.securityEventRetentionDays[0]) @Max(L.securityEventRetentionDays[1])
  securityEventRetentionDays?: number;
}
