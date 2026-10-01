import express from 'express';
import request from 'supertest';
import {
  createSwaggerBasicAuth,
  isSwaggerPath,
  parseBasicAuth,
} from './swagger-basic-auth.middleware';

const basic = (email: string, pw: string) =>
  'Basic ' + Buffer.from(`${email}:${pw}`).toString('base64');

describe('swagger-basic-auth (PLAN_HARDENING P4)', () => {
  it('isSwaggerPath chỉ khớp /api/docs*, không khớp route khác', () => {
    expect(isSwaggerPath('/api/docs')).toBe(true);
    expect(isSwaggerPath('/api/docs/swagger-ui-init.js')).toBe(true);
    expect(isSwaggerPath('/api/docs-json')).toBe(true);
    expect(isSwaggerPath('/api/docs-yaml')).toBe(true);
    expect(isSwaggerPath('/swagger-auth.js')).toBe(false);
    expect(isSwaggerPath('/api/customers')).toBe(false);
    expect(isSwaggerPath('/api/docsfoo')).toBe(false);
  });

  it('parseBasicAuth: mật khẩu chứa ":" vẫn đúng; header sai -> null', () => {
    expect(parseBasicAuth(basic('a@x.com', 'p:ss:word'))).toEqual({
      email: 'a@x.com',
      password: 'p:ss:word',
    });
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth('Bearer abc')).toBeNull();
    expect(parseBasicAuth('Basic !!!')).toBeNull();
  });

  describe('middleware', () => {
    let clock: number;
    const verify = jest.fn();
    const build = () => {
      const app = express();
      app.use(
        createSwaggerBasicAuth({
          verify,
          maxFailures: 3,
          windowMs: 60_000,
          now: () => clock,
        }),
      );
      app.get('/api/docs', (_q, r) => r.send('docs'));
      app.get('/api/docs-json', (_q, r) => r.json({ openapi: '3' }));
      app.get('/api/customers', (_q, r) => r.json({ ok: true }));
      app.get('/swagger-auth.js', (_q, r) => r.send('js'));
      return app;
    };

    beforeEach(() => {
      clock = 1_000_000;
      verify.mockReset();
    });

    it('không có Authorization -> 401 + WWW-Authenticate: Basic, không gọi verify', async () => {
      const res = await request(build()).get('/api/docs');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic realm=/);
      expect(verify).not.toHaveBeenCalled();
    });

    it('thông tin sai -> 401; admin đúng -> 200 (cả /api/docs-json)', async () => {
      verify.mockResolvedValueOnce(false);
      const bad = await request(build()).get('/api/docs').set('Authorization', basic('a@x.com', 'bad'));
      expect(bad.status).toBe(401);

      verify.mockResolvedValue(true);
      const app = build();
      const ok = await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'good'));
      expect(ok.status).toBe(200);
      const json = await request(app).get('/api/docs-json').set('Authorization', basic('a@x.com', 'good'));
      expect(json.status).toBe(200);
      expect(verify).toHaveBeenCalledWith('a@x.com', 'good');
    });

    it('không đụng route khác và /swagger-auth.js (vẫn công khai)', async () => {
      const app = build();
      expect((await request(app).get('/api/customers')).status).toBe(200);
      expect((await request(app).get('/swagger-auth.js')).status).toBe(200);
      expect(verify).not.toHaveBeenCalled();
    });

    it('verify ném lỗi -> 401 (fail-closed), không lộ lỗi', async () => {
      verify.mockRejectedValue(new Error('db down'));
      const res = await request(build()).get('/api/docs').set('Authorization', basic('a@x.com', 'x'));
      expect(res.status).toBe(401);
      expect(res.text).not.toContain('db down');
    });

    it('rate limit: sai quá 3 lần -> 429 + Retry-After, hết cửa sổ thì thử lại được', async () => {
      verify.mockResolvedValue(false);
      const app = build();
      for (let i = 0; i < 3; i++) {
        const r = await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'bad'));
        expect(r.status).toBe(401);
      }
      const blocked = await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'bad'));
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(verify).toHaveBeenCalledTimes(3); // lần thứ 4 bị chặn trước khi verify

      clock += 61_000;
      verify.mockResolvedValue(true);
      const again = await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'good'));
      expect(again.status).toBe(200);
    });

    it('đăng nhập đúng xoá bộ đếm sai; lần mở trang đầu (chưa gửi mật khẩu) không bị tính', async () => {
      const app = build();
      await request(app).get('/api/docs'); // 401 challenge, không tính
      await request(app).get('/api/docs');
      await request(app).get('/api/docs');
      verify.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'bad'));
      await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'bad'));
      const ok = await request(app).get('/api/docs').set('Authorization', basic('a@x.com', 'good'));
      expect(ok.status).toBe(200);
    });
  });
});
