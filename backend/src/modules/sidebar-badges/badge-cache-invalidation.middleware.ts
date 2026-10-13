import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SidebarBadgesService } from './sidebar-badges.service';

/** Request ghi KHÔNG làm đổi số đếm badge - bỏ qua để không xoá cache vô ích. */
const IGNORED_PREFIXES = ['/iclock', '/api/auth', '/api/notifications'];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function shouldInvalidateBadges(method: string | undefined, url: string | undefined, status: number): boolean {
  if (!method || !WRITE_METHODS.has(method.toUpperCase())) return false;
  if (status >= 400) return false;
  const path = (url ?? '').split('?')[0];
  return !IGNORED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Sau mỗi request GHI thành công trên instance này -> xoá cache số đếm badge để poll kế tiếp thấy số mới ngay
 * (xem SIDEBAR_BADGES_CACHE_DEFAULT_TTL_MS). Chạy ở `finish` nên không làm chậm response.
 */
@Injectable()
export class BadgeCacheInvalidationMiddleware implements NestMiddleware {
  constructor(private readonly badges: SidebarBadgesService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    res.on('finish', () => {
      if (shouldInvalidateBadges(req.method, req.originalUrl ?? req.url, res.statusCode)) this.badges.clearBadgesCache();
    });
    next();
  }
}
