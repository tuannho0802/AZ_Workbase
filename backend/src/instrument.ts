// PLAN_HARDENING P5 - khởi tạo Sentry. PHẢI được import ĐẦU TIÊN trong main.ts
// (trước mọi import khác) để SDK kịp gắn hook trước khi các module được load.
import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from './common/observability/sentry-scrub';

// Chỉ bật khi có DSN và đang chạy production/Vercel. Local/dev: không gửi gì.
const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

// Vercel nạp function qua launcher của họ bằng cờ `--require` (không đổi được
// từ repo). SDK v11 thấy `Sentry.init` nằm trong stack của file preload nên in
// cảnh báo "[Sentry] Initializing the SDK via the Node `--require` flag is no
// longer supported..." ở MỖI cold start. Cảnh báo đó nhắm vào kiểu preload
// `node -r ./instrument.js`; ở đây init chạy từ `import './instrument'` đầu
// `main.ts`, không có loader thread nào của Sentry. Chỉ trên Vercel: tạm bỏ các
// cờ `-r/--require` khỏi `process.execArgv` đúng trong lúc gọi `Sentry.init` (SDK
// chỉ đọc execArgv để đoán entry point) rồi khôi phục ngay. Local/PM2/khác: giữ
// nguyên để cảnh báo thật vẫn hiện nếu ai đó cố tình preload bằng `-r`.
function stripRequireFlags(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-r' || arg === '--require') {
      i++; // bỏ luôn giá trị đi kèm
    } else if (!/^(--require|-r)=/.test(arg)) {
      out.push(arg);
    }
  }
  return out;
}

const originalExecArgv = process.execArgv;
if (process.env.VERCEL === '1') {
  process.execArgv = stripRequireFlags(originalExecArgv);
}

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

process.execArgv = originalExecArgv;
