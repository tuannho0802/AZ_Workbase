import type { ErrorEvent } from '@sentry/nestjs';

/**
 * PLAN_HARDENING P5 - Lọc PII trước khi gửi event lên Sentry.
 *
 * Hệ thống chứa PII khách hàng (SĐT, email, tên, ghi chú) nên KHÔNG được đẩy
 * nguyên payload lên dịch vụ ngoài. Nguyên tắc: xoá hẳn mọi thứ thuộc request
 * (header/cookie/body/query) và che các mẫu PII còn sót trong text (message
 * lỗi, breadcrumb) - ví dụ lỗi TypeORM kiểu `Duplicate entry '0901234567'`.
 *
 * Hàm thuần (không I/O) để test được; dùng làm `beforeSend` ở instrument.ts.
 */

const REDACTED = '[Filtered]';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// SĐT Việt Nam: 0xxxxxxxxx hoặc +84/84xxxxxxxxx (9 số sau đầu số).
const PHONE_RE = /(?<!\d)(?:\+?84|0)[3-9]\d{8}(?!\d)/g;
const JWT_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER_RE = /Bearer\s+[\w.~+/=-]+/gi;

export function scrubText(input: string): string {
  return input
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED);
}

/** Bỏ query string + hash khỏi URL (query có thể chứa `search=<SĐT/tên khách>`). */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // 1. Request: giữ lại method + url (đã bỏ query), xoá toàn bộ phần còn lại.
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? stripQuery(event.request.url) : undefined,
    };
  }

  // 2. User: không gửi bất kỳ định danh nào (email/ip/username/id).
  delete event.user;

  // 3. extra/contexts tự do có thể chứa payload nghiệp vụ -> bỏ extra.
  delete event.extra;

  // 4. Text tự do: message + exception values.
  if (typeof event.message === 'string') {
    event.message = scrubText(event.message);
  }
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = scrubText(ex.value);
  }

  // 5. Breadcrumbs: che text, bỏ query khỏi URL, bỏ dữ liệu đính kèm khác.
  for (const bc of event.breadcrumbs ?? []) {
    if (typeof bc.message === 'string') bc.message = scrubText(bc.message);
    const url = bc.data?.url;
    bc.data = typeof url === 'string' ? { url: stripQuery(url) } : undefined;
  }

  return event;
}
