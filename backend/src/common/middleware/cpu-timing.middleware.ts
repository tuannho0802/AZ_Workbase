import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('CpuTiming');

/** Gom path động về 1 dạng chung (/customers/123 -> /customers/:id) để cộng dồn theo endpoint. */
export function normalizeRoute(path: string): string {
  return path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
}

/**
 * Đo CPU THẬT (user + system) của từng request, in 1 dòng log/request:
 *   [CpuTiming] cpu=12.3ms wall=140ms GET /api/customers/:id 200
 * Mọi route Nest chạy trong 1 function Vercel nên Observability không tách được theo endpoint -
 * xuất log rồi cộng cột cpu theo route để biết endpoint nào tốn nhất.
 *
 * ⚠️ `process.cpuUsage()` tính cho CẢ process: khi nhiều request chạy song song trên cùng instance (Fluid),
 * CPU của request này có thể lẫn CPU request khác -> dùng để so sánh tương đối/tổng theo endpoint, không phải số tuyệt đối.
 * Chỉ bật bằng env `CPU_TIMING=true` (mặc định TẮT; ghi log cũng tốn thêm chút CPU nên đo xong thì tắt).
 */
export function cpuTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startCpu = process.cpuUsage();
  const startWall = process.hrtime.bigint();

  res.once('finish', () => {
    const used = process.cpuUsage(startCpu);
    const cpuMs = (used.user + used.system) / 1000;
    const wallMs = Number(process.hrtime.bigint() - startWall) / 1e6;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : normalizeRoute(req.originalUrl || req.url);
    logger.log(
      `cpu=${cpuMs.toFixed(1)}ms wall=${wallMs.toFixed(0)}ms ${req.method} ${normalizeRoute(route)} ${res.statusCode}`,
    );
  });

  next();
}
