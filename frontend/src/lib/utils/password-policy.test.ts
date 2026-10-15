import { describe, expect, it } from 'vitest';
import { isPasswordPolicyValid, passwordPolicyRules, PASSWORD_REGEX } from './password-policy';

describe('password-policy (C1, FE)', () => {
  it('7 ký tự bị từ chối, 8+ hợp lệ', () => {
    expect(isPasswordPolicyValid('Abcd@12')).toBe(false);
    expect(isPasswordPolicyValid('Abcd@123')).toBe(true);
  });
  it('thiếu hoa / thường / số / đặc biệt đều bị từ chối', () => {
    expect(isPasswordPolicyValid('abcd@1234')).toBe(false);
    expect(isPasswordPolicyValid('ABCD@1234')).toBe(false);
    expect(isPasswordPolicyValid('Abcd@Abcd')).toBe(false);
    expect(isPasswordPolicyValid('Abcd12345')).toBe(false);
  });
  it('không phải chuỗi -> false', () => {
    expect(isPasswordPolicyValid(undefined)).toBe(false);
    expect(isPasswordPolicyValid(12345678)).toBe(false);
  });
  it('rules gồm required + min 8 + pattern', () => {
    expect(passwordPolicyRules).toHaveLength(3);
    expect(passwordPolicyRules[1]).toMatchObject({ min: 8 });
    expect(passwordPolicyRules[2]).toMatchObject({ pattern: PASSWORD_REGEX });
  });
});
