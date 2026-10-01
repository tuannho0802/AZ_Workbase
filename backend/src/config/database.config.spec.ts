import { ConfigService } from '@nestjs/config';
import { getTypeOrmConfig } from './database.config';

const makeConfig = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('getTypeOrmConfig - TLS', () => {
  const base = {
    DB_HOST: 'h',
    DB_PORT: '3306',
    DB_USERNAME: 'u',
    DB_PASSWORD: 'p',
    DB_DATABASE: 'd',
  };

  it('development: không bật SSL', () => {
    const cfg: any = getTypeOrmConfig(makeConfig({ ...base, NODE_ENV: 'development' }));
    expect(cfg.ssl).toBeUndefined();
  });

  it('production + DB_CA_CERT: xác thực chứng chỉ (rejectUnauthorized=true)', () => {
    const cfg: any = getTypeOrmConfig(
      makeConfig({ ...base, NODE_ENV: 'production', DB_CA_CERT: 'CERT' }),
    );
    expect(cfg.ssl).toEqual({ ca: 'CERT', rejectUnauthorized: true });
    expect(cfg.extra.ssl).toEqual({ ca: 'CERT', rejectUnauthorized: true });
  });

  it('production thiếu DB_CA_CERT: ném lỗi, không tắt xác thực âm thầm', () => {
    expect(() =>
      getTypeOrmConfig(makeConfig({ ...base, NODE_ENV: 'production' })),
    ).toThrow(/DB_CA_CERT/);
  });

  it('production thiếu DB_CA_CERT nhưng DB_SSL_ALLOW_INSECURE=true: cho phép (có cảnh báo)', () => {
    const cfg: any = getTypeOrmConfig(
      makeConfig({ ...base, NODE_ENV: 'production', DB_SSL_ALLOW_INSECURE: 'true' }),
    );
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('VERCEL=1 được coi là production', () => {
    expect(() => getTypeOrmConfig(makeConfig({ ...base, VERCEL: '1' }))).toThrow(/DB_CA_CERT/);
  });
});
