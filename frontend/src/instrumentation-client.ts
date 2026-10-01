// PLAN_HARDENING P5 - Sentry phía trình duyệt (Next.js tự nạp file này trước khi hydrate).
// Không bật Session Replay (không thêm replayIntegration) vì màn hình chứa PII khách hàng.
import * as Sentry from '@sentry/nextjs';
import { buildSentryOptions } from '@/lib/observability/sentry-options';

Sentry.init(buildSentryOptions());
