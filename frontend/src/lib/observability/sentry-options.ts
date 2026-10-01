import { scrubEvent, SENTRY_IGNORE_ERRORS } from './sentry-scrub';

/**
 * PLAN_HARDENING P5 - Option Sentry dùng chung cho client + server của Next.
 * Chỉ bật khi có DSN và đang chạy production (dev/local không gửi gì).
 * Không tracing, không Session Replay (không thêm integration replay).
 */
export function buildSentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn) && process.env.NODE_ENV === 'production',
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    // Release = commit SHA, gắn ở next.config.js (từ VERCEL_GIT_COMMIT_SHA).
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend: scrubEvent,
  };
}
