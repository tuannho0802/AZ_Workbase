import { assertJwtSecrets, getJwtRefreshSecret, getJwtSecret } from './jwt-secrets';

const cfg = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] }) as any;
const LONG_A = 'a'.repeat(40);
const LONG_B = 'b'.repeat(40);

describe('jwt-secrets (P3.4)', () => {
  it('getter ném lỗi khi thiếu hoặc rỗng, không có fallback', () => {
    expect(() => getJwtRefreshSecret(cfg({}))).toThrow(/JWT_REFRESH_SECRET/);
    expect(() => getJwtRefreshSecret(cfg({ JWT_REFRESH_SECRET: '   ' }))).toThrow(/JWT_REFRESH_SECRET/);
    expect(() => getJwtSecret(cfg({}))).toThrow(/JWT_SECRET/);
  });

  it('getter trả đúng giá trị khi đủ biến', () => {
    expect(getJwtRefreshSecret(cfg({ JWT_REFRESH_SECRET: LONG_B }))).toBe(LONG_B);
  });

  it('assert: thiếu 1 trong 2 -> throw', () => {
    expect(() => assertJwtSecrets(cfg({ JWT_SECRET: LONG_A }), true)).toThrow(/JWT_REFRESH_SECRET/);
    expect(() => assertJwtSecrets(cfg({ JWT_REFRESH_SECRET: LONG_B }), true)).toThrow(/JWT_SECRET/);
  });

  it('assert: 2 secret trùng nhau -> throw (kể cả khi tắt kiểm độ dài)', () => {
    expect(() => assertJwtSecrets(cfg({ JWT_SECRET: LONG_A, JWT_REFRESH_SECRET: LONG_A }), false)).toThrow(/trùng/);
  });

  it('assert: < 32 ký tự -> throw khi bật kiểm độ dài, bỏ qua khi tắt', () => {
    const env = { JWT_SECRET: 'short-a', JWT_REFRESH_SECRET: 'short-b' };
    expect(() => assertJwtSecrets(cfg(env), true)).toThrow(/quá ngắn/);
    expect(() => assertJwtSecrets(cfg(env), false)).not.toThrow();
  });

  it('assert: đủ biến, khác nhau, đủ dài -> qua', () => {
    expect(() => assertJwtSecrets(cfg({ JWT_SECRET: LONG_A, JWT_REFRESH_SECRET: LONG_B }), true)).not.toThrow();
  });

  it('assert: mặc định theo NODE_ENV=production', () => {
    const prev = process.env.NODE_ENV;
    const env = { JWT_SECRET: 'short-a', JWT_REFRESH_SECRET: 'short-b' };
    try {
      process.env.NODE_ENV = 'production';
      expect(() => assertJwtSecrets(cfg(env))).toThrow(/quá ngắn/);
      process.env.NODE_ENV = 'development';
      expect(() => assertJwtSecrets(cfg(env))).not.toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
