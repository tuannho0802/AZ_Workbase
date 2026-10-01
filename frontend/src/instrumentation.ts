import * as Sentry from '@sentry/nextjs';

// PLAN_HARDENING P5 - nạp Sentry cho runtime Node của server. Ứng dụng không có
// route chạy edge (proxy.ts chạy Node trong Next 16) nên không cấu hình edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

// Gom lỗi từ server component / route handler. Dữ liệu vẫn qua `beforeSend` (lọc PII).
export const onRequestError = Sentry.captureRequestError;
