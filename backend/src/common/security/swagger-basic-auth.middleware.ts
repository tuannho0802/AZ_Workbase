import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * PLAN_HARDENING P4 - bảo vệ Swagger bằng Basic auth (tài khoản thật, chỉ admin).
 *
 * Phạm vi: CHỈ `/api/docs`, `/api/docs/*`, `/api/docs-json`, `/api/docs-yaml`.
 * `/swagger-auth.js` (file tĩnh ở gốc, chỉ đọc token từ localStorage) và mọi route khác KHÔNG bị ảnh
 * hưởng. Basic auth (không phải JWT Bearer) vì điều hướng trang không gửi được header Authorization.
 *
 * Rate limit: đếm số lần SAI theo IP trong cửa sổ trượt; vượt ngưỡng -> 429 + Retry-After. Đăng nhập
 * đúng thì xoá bộ đếm của IP đó. ⚠️ Bộ đếm nằm trong RAM của từng instance - trên Vercel serverless mỗi
 * instance đếm riêng nên đây là lớp giảm thiểu brute-force, không phải giới hạn tuyệt đối (bcrypt cost
 * 10 vẫn làm mỗi lần thử tốn thời gian). Việc không có thêm hạ tầng (Redis...) là chủ ý của plan.
 */

const logger = new Logger('SwaggerAuth');

const REALM = 'AZWorkbase API Docs';

export function isSwaggerPath(path: string): boolean {
  return (
    path === '/api/docs' ||
    path.startsWith('/api/docs/') ||
    path === '/api/docs-json' ||
    path === '/api/docs-yaml'
  );
}

/** Tách `Authorization: Basic base64(email:password)`; mật khẩu có thể chứa ':' nên cắt ở dấu ':' đầu tiên. */
export function parseBasicAuth(
  header: string | undefined,
): { email: string; password: string } | null {
  if (!header) return null;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx <= 0) return null;
  return { email: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/** Bỏ ký tự điều khiển + cắt ngắn để không bị chèn dòng giả vào log. */
function safeForLog(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100);
}

export interface SwaggerBasicAuthOptions {
  verify: (email: string, password: string) => Promise<boolean>;
  /** Số lần sai tối đa / IP / cửa sổ. Mặc định 5. */
  maxFailures?: number;
  /** Cửa sổ tính (ms). Mặc định 15 phút. */
  windowMs?: number;
  /** Chỉ để test. */
  now?: () => number;
}

export function createSwaggerBasicAuth(options: SwaggerBasicAuthOptions) {
  const maxFailures = options.maxFailures ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const now = options.now ?? Date.now;
  const failures = new Map<string, number[]>();

  const recentFailures = (ip: string): number[] => {
    const cutoff = now() - windowMs;
    const list = (failures.get(ip) ?? []).filter((t) => t > cutoff);
    if (list.length) failures.set(ip, list);
    else failures.delete(ip);
    return list;
  };

  const challenge = (res: Response) => {
    res.setHeader('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`);
    res.status(401).type('text/plain').send('Cần đăng nhập tài khoản admin để xem tài liệu API.');
  };

  return async function swaggerBasicAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!isSwaggerPath(req.path)) return next();

    const ip = req.ip || 'unknown';
    const attempts = recentFailures(ip);
    if (attempts.length >= maxFailures) {
      const retryAfter = Math.max(1, Math.ceil((attempts[0] + windowMs - now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).type('text/plain').send('Thử sai quá nhiều lần. Vui lòng thử lại sau.');
      return;
    }

    const credentials = parseBasicAuth(req.headers.authorization);
    if (!credentials) {
      // Chưa gửi thông tin (trình duyệt vừa mở trang) -> chỉ hỏi mật khẩu, KHÔNG tính là lần sai.
      challenge(res);
      return;
    }

    let ok = false;
    try {
      ok = await options.verify(credentials.email, credentials.password);
    } catch (err) {
      logger.error('Lỗi khi xác thực Swagger', err instanceof Error ? err.stack : String(err));
    }

    if (!ok) {
      failures.set(ip, [...attempts, now()]);
      logger.warn(
        `[SECURITY] Swagger auth thất bại ip=${safeForLog(ip)} email=${safeForLog(credentials.email)}`,
      );
      challenge(res);
      return;
    }

    failures.delete(ip);
    next();
  };
}
