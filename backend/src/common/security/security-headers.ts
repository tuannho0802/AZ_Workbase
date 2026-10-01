import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

/**
 * PLAN_HARDENING P3 - header bảo mật cho BE (helmet).
 *
 * Chia 2 nhóm đường dẫn vì nội dung phục vụ khác bản chất:
 * 1) API JSON (`/api/*` trừ `/api/docs*`, `/iclock/*`): không có HTML nên dùng
 *    CSP khoá chặt (`default-src 'none'`) - nếu lỡ có 1 response bị trình
 *    duyệt render như HTML thì không chạy được script nào.
 * 2) Trang HTML tĩnh: Swagger UI (`/api/docs*`) và landing page `/` (public/
 *    index.html) - cần tải script/CSS từ cdnjs + cdn.tailwindcss.com và có
 *    inline script/onclick -> dùng CSP nới đúng các nguồn đó, KHÔNG tắt hẳn.
 *
 * `crossOriginResourcePolicy: 'cross-origin'` BẮT BUỘC: FE (azworkbase.com /
 * vercel.app) gọi API khác origin; mặc định helmet đặt `same-origin` sẽ làm
 * trình duyệt chặn đọc response/ảnh từ BE. CORS thật vẫn do `enableCors`.
 */

const API_CSP = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
  },
};

const HTML_CSP = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'", // Tailwind Play CDN trên landing page cần eval
      'https://cdnjs.cloudflare.com',
      'https://cdn.tailwindcss.com',
    ],
    scriptSrcAttr: ["'unsafe-inline'"], // onclick="..." trên landing page
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://cdnjs.cloudflare.com',
      'https://fonts.googleapis.com',
    ],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https:'], // Swagger "Try it out" gọi API
    frameAncestors: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
  },
};

const common = {
  crossOriginResourcePolicy: { policy: 'cross-origin' as const },
  // Giữ mặc định helmet cho HSTS (180 ngày, includeSubDomains), nosniff,
  // Referrer-Policy: no-referrer, X-Frame-Options: SAMEORIGIN...
};

const apiHelmet = helmet({ ...common, contentSecurityPolicy: API_CSP });
const htmlHelmet = helmet({ ...common, contentSecurityPolicy: HTML_CSP });

/** `/api/docs`, `/api/docs-json`, `/api/docs-yaml`, `/api/docs/...` */
export function isHtmlPath(path: string): boolean {
  if (path.startsWith('/api/docs')) return true;
  // Mọi thứ NGOÀI /api và /iclock (landing page, assets, styles, swagger-auth.js)
  return !path.startsWith('/api/') && !path.startsWith('/iclock/');
}

export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const handler = isHtmlPath(req.path) ? htmlHelmet : apiHelmet;
  handler(req, res, next);
}
