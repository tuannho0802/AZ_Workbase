import type { NextFunction, Request, Response } from 'express';
import { isSwaggerPath } from './swagger-basic-auth.middleware';

/**
 * Khi SWAGGER_ENABLED=false, Swagger KHÔNG được đăng ký -> /api/docs* rơi xuống Nest và nhận 404 JSON thô
 * (hoặc lỗi khó hiểu). Middleware này chặn sớm đúng nhóm đường dẫn Swagger và trả:
 *  - Trình duyệt (Accept có text/html) vào `/api/docs`, `/api/docs/*`: trang HTML 404 thân thiện.
 *  - Mọi client khác (`/api/docs-json`, `/api/docs-yaml`, curl, fetch...): 404 JSON cùng hình dạng với
 *    AllExceptionsFilter để không phá client nào đang parse lỗi.
 *
 * Không chạm DB/AuthService (không tốn Active CPU), và KHÔNG nhắc tên biến môi trường trong nội dung trả
 * ra - tránh lộ chi tiết cấu hình hạ tầng cho người ngoài.
 */

const PAGE_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>404 - Tài liệu API không khả dụng | AZWorkbase</title>
<style>
  :root { --bg:#f8fafc; --card:#ffffff; --text:#0f172a; --muted:#64748b; --border:#e2e8f0; --accent:#2563eb; --accent-soft:#eff6ff; --warn:#f59e0b; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b1220; --card:#111a2e; --text:#e5edf9; --muted:#94a3b8; --border:#1f2a44; --accent:#60a5fa; --accent-soft:#16233f; --warn:#fbbf24; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display:flex; align-items:center; justify-content:center; padding:24px; background:var(--bg); color:var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height:1.55; }
  .card { width:100%; max-width:520px; text-align:center; background:var(--card); border:1px solid var(--border);
    border-radius:16px; padding:40px 32px; box-shadow:0 10px 30px rgba(15,23,42,.08); }
  .icon { width:72px; height:72px; margin:0 auto 20px; border-radius:50%; background:var(--accent-soft);
    display:flex; align-items:center; justify-content:center; }
  .code { font-size:64px; font-weight:800; letter-spacing:-2px; margin:0; color:var(--accent); line-height:1; }
  h1 { font-size:20px; margin:12px 0 8px; font-weight:700; }
  p { margin:0 0 8px; color:var(--muted); font-size:15px; }
  .badge { display:inline-flex; align-items:center; gap:6px; margin:16px 0 24px; padding:6px 12px; border-radius:999px;
    font-size:13px; font-weight:600; color:var(--warn); border:1px solid var(--warn); }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--warn); }
  .actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
  a.btn { display:inline-block; padding:10px 20px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none;
    background:var(--accent); color:#fff; }
  a.btn:hover { opacity:.9; }
  .foot { margin-top:24px; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
  <main class="card" role="main">
    <div class="icon" aria-hidden="true">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 13 6 6"/><path d="m15 13-6 6"/>
      </svg>
    </div>
    <p class="code">404</p>
    <h1>Tài liệu API hiện không khả dụng</h1>
    <p>Trang tài liệu API (Swagger) đang được tắt trên môi trường này nên không thể truy cập.</p>
    <p>Nếu bạn cần xem tài liệu, vui lòng liên hệ quản trị viên hệ thống.</p>
    <div class="badge"><span class="dot"></span>Tài liệu đang tạm đóng</div>
    <div class="actions"><a class="btn" href="/">Về trang chủ</a></div>
    <div class="foot">AZWorkbase API</div>
  </main>
</body>
</html>`;

/** Trình duyệt điều hướng trang: Accept chứa text/html. fetch/curl mặc định không có -> nhận JSON. */
function wantsHtml(req: Request): boolean {
  const accept = req.headers.accept ?? '';
  return /text\/html/i.test(accept);
}

export function swaggerDisabledHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isSwaggerPath(req.path)) return next();

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const isJsonDoc = req.path === '/api/docs-json' || req.path === '/api/docs-yaml';
  if (!isJsonDoc && wantsHtml(req)) {
    res.status(404).type('html').send(PAGE_HTML);
    return;
  }

  res.status(404).json({
    statusCode: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    message: 'Tài liệu API hiện không khả dụng',
  });
}
