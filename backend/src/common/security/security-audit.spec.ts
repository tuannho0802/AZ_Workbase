import { NOT_AN_EMAIL_PLACEHOLDER, SECURITY_AUDIT_ACTIONS, sanitizeEmailForAudit, sanitizeSecurityDetail } from './security-audit';
import { RETENTION_PROTECTED_AUDIT_ACTIONS } from '../../modules/retention/retention.constants';

describe('security-audit (P4.1)', () => {
  it('sanitizeEmailForAudit: email hợp lệ -> chữ thường; chuỗi không phải email (nghi mật khẩu) -> placeholder', () => {
    expect(sanitizeEmailForAudit('  User@Example.COM ')).toBe('user@example.com');
    expect(sanitizeEmailForAudit('MatKhau@123')).toBe(NOT_AN_EMAIL_PLACEHOLDER);
    expect(sanitizeEmailForAudit('co khoang trang@a.b')).toBe(NOT_AN_EMAIL_PLACEHOLDER);
    expect(sanitizeEmailForAudit('a'.repeat(300) + '@b.co')).toBe(NOT_AN_EMAIL_PLACEHOLDER);
    expect(sanitizeEmailForAudit('')).toBeNull();
    expect(sanitizeEmailForAudit(undefined)).toBeNull();
  });

  it('sanitizeSecurityDetail: bỏ MỌI khoá giống password/token/secret, làm sạch email, cắt chuỗi dài', () => {
    const out = sanitizeSecurityDetail({
      email: 'MatKhauBiMat',
      password: 'p', newPassword: 'x', refreshToken: 't', JWT_SECRET: 's', authorization: 'Bearer x',
      attempts: 3, note: 'n'.repeat(900),
    })!;
    expect(out.email).toBe(NOT_AN_EMAIL_PLACEHOLDER);
    expect(out).not.toHaveProperty('password');
    expect(out).not.toHaveProperty('newPassword');
    expect(out).not.toHaveProperty('refreshToken');
    expect(out).not.toHaveProperty('JWT_SECRET');
    expect(out).not.toHaveProperty('authorization');
    expect(out.attempts).toBe(3);
    expect((out.note as string).length).toBe(500);
    expect(JSON.stringify(out)).not.toContain('MatKhauBiMat');
  });

  it('sanitizeSecurityDetail: null/undefined -> null', () => {
    expect(sanitizeSecurityDetail(null)).toBeNull();
    expect(sanitizeSecurityDetail(undefined)).toBeNull();
  });

  it('có đủ 17 action (11 gốc + 2 whitelist P3.5 + 2 quốc gia IP P3.6 + 2 blacklist P3.7), độ dài ≤ 50 (cột audit_logs.action), và job dọn chung bảo vệ tất cả', () => {
    expect(SECURITY_AUDIT_ACTIONS).toHaveLength(17);
    expect(SECURITY_AUDIT_ACTIONS).toEqual(expect.arrayContaining(['IP_WHITELIST_ADDED', 'IP_WHITELIST_REMOVED', 'IP_COUNTRY_SET', 'IP_COUNTRY_CLEARED', 'IP_BLACKLIST_ADDED', 'IP_BLACKLIST_REMOVED']));
    for (const a of SECURITY_AUDIT_ACTIONS) expect(a.length).toBeLessThanOrEqual(50);
    expect(RETENTION_PROTECTED_AUDIT_ACTIONS).toEqual([...SECURITY_AUDIT_ACTIONS]);
  });
});
