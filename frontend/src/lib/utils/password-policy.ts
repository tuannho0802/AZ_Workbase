import type { Rule } from 'antd/es/form';

/**
 * C1 - chính sách mật khẩu DUY NHẤT phía FE (khớp `backend/src/common/validators/password-policy.ts`):
 * ≥ 8 ký tự + chữ hoa, chữ thường, số, ký tự đặc biệt. Mọi form đặt mật khẩu mới dùng chung `passwordPolicyRules`.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
export const PASSWORD_MIN_LENGTH_MESSAGE = `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`;
export const PASSWORD_COMPLEXITY_MESSAGE = 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt';
export const PASSWORD_POLICY_HINT = `Ít nhất ${PASSWORD_MIN_LENGTH} ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (@$!%*?&)`;

export function isPasswordPolicyValid(value: unknown): boolean {
  return typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH && PASSWORD_REGEX.test(value);
}

/** Rule antd cho ô "mật khẩu mới" (kèm `required`). */
export const passwordPolicyRules: Rule[] = [
  { required: true, message: 'Vui lòng nhập mật khẩu' },
  { min: PASSWORD_MIN_LENGTH, message: PASSWORD_MIN_LENGTH_MESSAGE },
  { pattern: PASSWORD_REGEX, message: PASSWORD_COMPLEXITY_MESSAGE },
];

/** Rule "nhập lại" khớp với field `field` trong form. */
export const confirmPasswordRule = (field: string): Rule =>
  ({ getFieldValue }) => ({
    validator(_, value) {
      if (!value || getFieldValue(field) === value) return Promise.resolve();
      return Promise.reject(new Error('Mật khẩu nhập lại không khớp'));
    },
  });
