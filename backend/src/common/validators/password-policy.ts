import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MinLength } from 'class-validator';

/**
 * C1 - CHÍNH SÁCH MẬT KHẨU DUY NHẤT của hệ thống (≥ 8 ký tự, có chữ hoa/thường/số/ký tự đặc biệt).
 * Dùng cho: register, create-user, reset-password, change-password, change-password-required.
 * Regex GIỮ NGUYÊN như `reset-password.dto.ts` cũ để không đổi hành vi (chỉ gom về 1 chỗ).
 * Không ép người dùng đang có mật khẩu ngắn đổi lại - chỉ áp khi họ đặt mật khẩu mới.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
export const PASSWORD_MIN_LENGTH_MESSAGE = `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`;
export const PASSWORD_COMPLEXITY_MESSAGE = 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt';

export function isPasswordPolicyValid(value: unknown): boolean {
  return typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH && PASSWORD_REGEX.test(value);
}

/** Decorator gộp: IsString + MinLength(8) + Matches(regex). */
export function IsPolicyPassword() {
  return applyDecorators(
    IsString({ message: 'Mật khẩu phải là chuỗi ký tự' }),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    Matches(PASSWORD_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE }),
  );
}
