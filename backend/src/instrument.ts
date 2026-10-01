// PLAN_HARDENING P5 - khởi tạo Sentry. PHẢI được import ĐẦU TIÊN trong main.ts
// (trước mọi import khác) để SDK kịp gắn hook trước khi các module được load.
import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from './common/observability/sentry-scrub';

// Chỉ bật khi có DSN và đang chạy production/Vercel. Local/dev: không gửi gì.
const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && isProd,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  // Release = commit SHA (Vercel tự gắn). Dùng để map lỗi -> commit.
  release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
  // SDK v11 không còn option `sendDefaultPii`; lớp lọc PII bắt buộc nằm ở
  // `beforeSend` (xoá request/user/extra, che SĐT/email/token trong text).
  // Chỉ gom lỗi - không tracing/profiling (tránh tốn quota + giảm overhead cold start).
  tracesSampleRate: 0,
  maxBreadcrumbs: 20,
  // Tắt ContextLines: tích hợp này đọc vài dòng SOURCE quanh stack frame rồi gửi
  // đi (không cần thiết, tốn I/O trên serverless, có thể kéo theo giá trị
  // hard-code trong code lên dịch vụ ngoài).
  integrations: (defaults) => defaults.filter((i) => i.name !== 'ContextLines'),
  beforeSend: (event) => scrubEvent(event),
});
