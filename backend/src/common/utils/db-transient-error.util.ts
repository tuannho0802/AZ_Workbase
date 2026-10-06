import { Logger } from '@nestjs/common';

const logger = new Logger('DbRetry');

/** Mã lỗi mạng/kết nối MySQL do connection trong pool bị server/proxy cắt (Aiven idle, Vercel đóng băng...). */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ER_CON_COUNT_ERROR',
]);

/**
 * Lỗi "tạm thời" của kết nối DB (không phải lỗi SQL/logic).
 * TypeORM bọc lỗi mysql2 trong QueryFailedError và giữ lỗi gốc ở `driverError`.
 */
export function isTransientDbError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; driverError?: { code?: string; message?: string } } | null;
  if (!e) return false;
  const code = e.driverError?.code ?? e.code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const msg = `${e.driverError?.message ?? ''} ${e.message ?? ''}`;
  return /ECONNRESET|PROTOCOL_CONNECTION_LOST|Connection lost|socket hang up/i.test(msg);
}

/**
 * Chạy `fn`, nếu dính lỗi kết nối tạm thời thì thử lại (mặc định 1 lần).
 * CHỈ dùng cho query ĐỌC (idempotent) - không bọc thao tác ghi để tránh ghi trùng.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 200): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || attempt === retries) throw err;
      logger.warn(`Mất kết nối DB tạm thời, thử lại lần ${attempt + 1}/${retries}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
