import type { ErrorEvent } from '@sentry/nextjs';

/**
 * PLAN_HARDENING P5 - Lọc PII trước khi gửi event lên Sentry (FE + server của Next).
 *
 * Hệ thống chứa PII khách hàng (SĐT, email, tên, ghi chú). Nguyên tắc: xoá
 * toàn bộ request/user/extra và che các mẫu PII còn sót trong text. URL của
 * breadcrumb (fetch/xhr/navigation) bị bỏ query vì có dạng
 * `/customers?search=0901234567`.
 *
 * Hàm thuần để test được; dùng làm `beforeSend` ở instrumentation-client.ts
 * và sentry.server.config.ts. (Bản BE nằm ở backend/src/common/observability.)
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

/** Bỏ query string + hash khỏi URL. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // Request: chỉ giữ method + url (đã bỏ query), bỏ header/cookie/body.
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? stripQuery(event.request.url) : undefined,
    };
  }

  // Không gửi bất kỳ định danh người dùng nào.
  delete event.user;
  delete event.extra;

  if (typeof event.message === 'string') {
    event.message = scrubText(event.message);
  }
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = scrubText(ex.value);
  }

  for (const bc of event.breadcrumbs ?? []) {
    if (typeof bc.message === 'string') bc.message = scrubText(bc.message);
    const data = bc.data;
    if (data) {
      // Chỉ giữ URL (đã bỏ query) - bỏ mọi dữ liệu đính kèm khác (body, từ/đến...).
      const url = data.url ?? data.to;
      bc.data = typeof url === 'string' ? { url: stripQuery(url) } : undefined;
    }
  }

  return event;
}

/** Lỗi nhiễu không đáng gửi: axios 4xx (đã có toast), huỷ request, ResizeObserver. */
export const SENTRY_IGNORE_ERRORS: Array<string | RegExp> = [
  /Request failed with status code 4\d\d/,
  /ResizeObserver loop/,
  /^canceled$/,
  'AbortError',
];
