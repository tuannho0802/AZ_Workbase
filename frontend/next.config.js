/** @type {import('next').NextConfig} */
const { withBotId } = require('botid/next/config');

// ===== PLAN_HARDENING P3 - Header bảo mật =====
// Origin của API (từ NEXT_PUBLIC_API_URL) để cho phép trong `connect-src`.
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
const API_ORIGIN = originOf(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');
const isDev = process.env.NODE_ENV !== 'production';

// CSP: mặc định Report-Only (chỉ báo vi phạm ở console, KHÔNG chặn) trong
// 1-2 tuần đầu theo plan. Khi console sạch vi phạm -> đặt biến môi trường
// CSP_ENFORCE=true (Vercel) để chuyển sang chặn thật, không cần sửa code.
const CSP_ENFORCE = process.env.CSP_ENFORCE === 'true';

const csp = [
  "default-src 'self'",
  // Next.js chèn inline script (hydration) và chưa dùng nonce -> cần 'unsafe-inline'.
  // 'unsafe-eval' chỉ ở dev (React refresh/HMR).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // antd CSS-in-JS chèn <style> inline.
  "style-src 'self' 'unsafe-inline'",
  // Ảnh: B2 (avatar/đính kèm - presigned GET), data:/blob: (preview antd, upload).
  "img-src 'self' data: blob: https://*.backblazeb2.com",
  "font-src 'self' data:",
  // API + B2 (PUT presigned) + Sentry (P5). localhost cho dev.
  ['connect-src', "'self'", API_ORIGIN, 'https://*.backblazeb2.com', 'https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io', 'https://*.ingest.de.sentry.io']
    .filter(Boolean)
    .join(' '),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    key: CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    value: csp,
  },
];

const nextConfig = {
  // Tối ưu bundle size
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', 'zustand'],
  },

  // Compression
  compress: true,

  // Image optimization
  images: {
    minimumCacheTTL: 3600,
    formats: ['image/webp', 'image/avif'],
  },

  // ⚠️ ĐÃ BỎ `output: 'standalone'` - đây là chế độ dành cho SELF-HOST
  // (chạy `node .next/standalone/server.js` trong Docker/VPS riêng), không
  // phải cho Vercel. Vercel có adapter build RIÊNG (@vercel/next), tự đóng
  // gói thành serverless functions từ `.next` build thông thường - không hề
  // chạy standalone server.js. Đặt `output: 'standalone'` khi deploy Vercel
  // là thừa và có thể làm asset tĩnh import trực tiếp (`import logo from
  // '...png'`) resolve sai hash path (không lỗi 404 network vì đây là
  // reference nội bộ, không phải HTTP request) - đúng khớp triệu chứng "ảnh
  // không hiện, không lỗi 404" đang gặp. Nếu sau này cần self-host thật
  // (không dùng Vercel nữa), mới bật lại dòng `output: 'standalone'`.

  // PLAN_HARDENING P3: header bảo mật cho mọi route.
  // Rollback: xoá khối `headers()` này.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  allowedDevOrigins: ['localhost', '127.0.0.1', '[::1]'],
};

// FIX: thay thế Cloudflare Turnstile bằng Vercel BotID - `withBotId` gắn
// thêm rewrite ở tầng edge để script chống bot được phục vụ CHÍNH từ domain
// của mình (không phải domain bên thứ 3 như Cloudflare) - tránh bị
// ad-blocker/extension chặn nhầm là script "bên thứ 3 theo dõi". Chỉ hoạt
// động khi deploy trên Vercel (dev local vẫn chạy được bình thường, BotID
// tự nhận biết môi trường dev - xem `checkBotId()` ở
// `frontend/src/app/api/auth/register/route.ts`).
module.exports = withBotId(nextConfig);