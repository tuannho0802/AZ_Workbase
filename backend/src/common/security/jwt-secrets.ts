// PLAN_RETENTION_SECURITY_ROADMAP P3.4 - bắt buộc JWT_SECRET / JWT_REFRESH_SECRET, bỏ fallback.
// Tránh ký/verify refresh token bằng secret mặc định đoán được ('default-refresh-secret' trước đây).
import type { ConfigService } from '@nestjs/config';

export const JWT_SECRET_MIN_LENGTH = 32;

type EnvReader = Pick<ConfigService, 'get'>;

function readRequired(config: EnvReader, key: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = config.get<string>(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu biến môi trường bắt buộc ${key}. Đặt giá trị ngẫu nhiên >= ${JWT_SECRET_MIN_LENGTH} ký tự.`);
  }
  return value;
}

/** Secret ký access token. Ném lỗi nếu thiếu. */
export function getJwtSecret(config: EnvReader): string {
  return readRequired(config, 'JWT_SECRET');
}

/** Secret ký/verify refresh token - 1 getter duy nhất cho cả ký và verify. Ném lỗi nếu thiếu. */
export function getJwtRefreshSecret(config: EnvReader): string {
  return readRequired(config, 'JWT_REFRESH_SECRET');
}

/**
 * Kiểm tra lúc khởi động (gọi từ JwtModule factory): thiếu, trùng nhau, hoặc quá ngắn -> throw, app không lên.
 * `enforceMinLength`: mặc định chỉ bắt buộc độ dài khi NODE_ENV=production (Vercel Preview/Production đều
 * là production) để file `.env.development` cũ của dev không vỡ; thiếu/trùng thì LUÔN bị chặn ở mọi môi trường.
 */
export function assertJwtSecrets(
  config: EnvReader,
  enforceMinLength: boolean = process.env.NODE_ENV === 'production',
): void {
  const access = getJwtSecret(config);
  const refresh = getJwtRefreshSecret(config);

  if (access === refresh) {
    throw new Error('JWT_SECRET và JWT_REFRESH_SECRET không được trùng nhau.');
  }
  if (enforceMinLength) {
    for (const [key, value] of [['JWT_SECRET', access], ['JWT_REFRESH_SECRET', refresh]] as const) {
      if (value.length < JWT_SECRET_MIN_LENGTH) {
        throw new Error(`${key} quá ngắn (${value.length} ký tự); cần >= ${JWT_SECRET_MIN_LENGTH} ký tự.`);
      }
    }
  }
}
