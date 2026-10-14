/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 4: sự kiện bảo mật ghi vào `audit_logs`.
 * `SECURITY_AUDIT_ACTIONS` dùng chung cho: ghi sự kiện, trang /security-activity và job dọn (RetentionService) —
 * thêm action mới thì thêm Ở ĐÂY để cả 3 nơi cùng nhận.
 */
export const SECURITY_AUDIT_ACTIONS = [
  'LOGIN_FAILED',
  'LOGIN_UNKNOWN_EMAIL',
  'ACCOUNT_LOCKED',
  'LOGIN_IP_BLOCKED',
  'UNLOCK_LOGIN',
  'UNBLOCK_LOGIN_IP',
  'PASSWORD_CHANGE_FAILED',
  'PASSWORD_CHANGED',
  'FORCE_LOGOUT',
  'SESSION_REVOKED',
  'UPDATE_SECURITY_CONFIG',
] as const;

export type SecurityAuditAction = (typeof SECURITY_AUDIT_ACTIONS)[number];

/** `entity_type` của mọi dòng sự kiện bảo mật do `logSecurityEvent` ghi. */
export const SECURITY_AUDIT_ENTITY = 'security';

/** Giá trị thay cho ô email không đúng định dạng (người dùng hay dán nhầm mật khẩu vào ô email). */
export const NOT_AN_EMAIL_PLACEHOLDER = '[không phải email]';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENSITIVE_KEY_RE = /pass(word)?|token|secret|authorization|cookie/i;

/** Email an toàn để lưu: cắt ≤ 255, chữ thường; không đúng dạng email -> placeholder (KHÔNG lưu chuỗi gốc). */
export function sanitizeEmailForAudit(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length === 0) return null;
  if (e.length > 255 || !EMAIL_RE.test(e)) return NOT_AN_EMAIL_PLACEHOLDER;
  return e;
}

/**
 * Làm sạch `detail` trước khi ghi: `email` qua `sanitizeEmailForAudit`, bỏ MỌI khoá giống mật khẩu/token/secret
 * (phòng caller truyền nhầm nguyên DTO đăng nhập). Chỉ giữ giá trị nguyên thuỷ/đối tượng nông.
 */
export function sanitizeSecurityDetail(detail?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    if (k === 'email') {
      const safe = sanitizeEmailForAudit(v);
      if (safe !== null) out.email = safe;
      continue;
    }
    if (typeof v === 'string') out[k] = v.slice(0, 500);
    else out[k] = v;
  }
  return out;
}
