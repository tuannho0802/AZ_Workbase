import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ description: `Hạn giữ log lượt truy cập IP (ngày) (${range('ipAccessLogRetentionDays')})` })
  @IsOptional() @IsInt() @Min(L.ipAccessLogRetentionDays[0]) @Max(L.ipAccessLogRetentionDays[1])
  ipAccessLogRetentionDays?: number;

  @ApiPropertyOptional({ description: `Số dòng chi tiết tối đa / IP / giờ (${range('ipAccessDetailCapPerHour')})` })
  @IsOptional() @IsInt() @Min(L.ipAccessDetailCapPerHour[0]) @Max(L.ipAccessDetailCapPerHour[1])
  ipAccessDetailCapPerHour?: number;

  @ApiPropertyOptional({ description: `Bật log request API đã đăng nhập: 1 = bật, 0 = tắt (${range('ipAccessLogApiEnabled')})` })
  @IsOptional() @IsInt() @Min(L.ipAccessLogApiEnabled[0]) @Max(L.ipAccessLogApiEnabled[1])
  ipAccessLogApiEnabled?: number;
}


/** P3.5: thêm IP vào whitelist. Định dạng IP thật sự do `normalizeIp` kiểm ở service (400 nếu sai). */
export class AddIpWhitelistDto {
  @ApiProperty({ example: '203.0.113.10', description: 'IPv4/IPv6 (đúng 1 địa chỉ, không CIDR)' })
  @IsString() @MaxLength(45)
  ip: string;

  @ApiPropertyOptional({ example: 'Văn phòng HCM' })
  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}


/** P3.7: chặn IP chủ động. `durationHours` bỏ trống/null = vĩnh viễn. Định dạng IP do `normalizeIp` kiểm ở controller. */
export class AddIpBlacklistDto {
  @ApiProperty({ example: '203.0.113.10', description: 'IPv4/IPv6 (đúng 1 địa chỉ, không CIDR)' })
  @IsString() @MaxLength(45)
  ip: string;

  @ApiPropertyOptional({ example: 'Dò mật khẩu nhiều email' })
  @IsOptional() @IsString() @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({ example: 24, nullable: true, description: 'Số giờ chặn (1–8760). Bỏ trống/null = vĩnh viễn' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8760)
  durationHours?: number | null;
}


/** P3.6: Admin gán quốc gia thủ công cho 1 IP. Mã hợp lệ do `IpGeoService.setManual` kiểm (400 nếu sai). */
export class SetIpCountryDto {
  @ApiProperty({ example: 'VN', description: 'ISO-3166 alpha-2' })
  @IsString() @MaxLength(2)
  countryCode: string;
}

const OUTCOMES = ['success', 'wrong_password', 'unknown_email', 'account_locked', 'ip_locked', 'denied', 'refresh_ok', 'refresh_failed', 'api'];

export class GetIpAccessDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Tối đa 100/trang' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['all', 'blocked', 'whitelisted', 'banned'] }) @IsOptional() @IsIn(['all', 'blocked', 'whitelisted', 'banned'])
  status?: 'all' | 'blocked' | 'whitelisted' | 'banned';

  @ApiPropertyOptional({ description: 'Tìm theo IP (chứa)' }) @IsOptional() @IsString() @MaxLength(45)
  search?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (giờ VN, YYYY-MM-DD). Không truyền cả 2 biên -> mặc định TUẦN NÀY; tối đa 93 ngày.' }) @IsOptional() @Matches(DATE_RE, { message: 'fromDate phải dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (giờ VN, YYYY-MM-DD)' }) @IsOptional() @Matches(DATE_RE, { message: 'toDate phải dạng YYYY-MM-DD' })
  toDate?: string;
}

export class GetIpAccessDetailDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: OUTCOMES }) @IsOptional() @IsIn(OUTCOMES)
  outcome?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'fromDate phải dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(DATE_RE, { message: 'toDate phải dạng YYYY-MM-DD' })
  toDate?: string;
}
