import { Controller, Get, Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { swaggerDisabledHandler } from './swagger-disabled.middleware';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

describe('swaggerDisabledHandler (SWAGGER_ENABLED=false)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.use(swaggerDisabledHandler);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/docs với Accept text/html -> 404 trang HTML, không lộ tên biến môi trường', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').set('Accept', 'text/html,application/xhtml+xml');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Tài liệu API hiện không khả dụng');
    expect(res.text).not.toContain('SWAGGER_ENABLED');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('/api/docs/swagger-ui-init.js (đường dẫn con) cũng 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/anything').set('Accept', 'text/html');
    expect(res.status).toBe(404);
  });

  it('/api/docs không gửi Accept html (curl/fetch) -> 404 JSON', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').set('Accept', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, message: 'Tài liệu API hiện không khả dụng' });
  });

  it('/api/docs-json và /api/docs-yaml luôn 404 JSON dù Accept là html', async () => {
    for (const path of ['/api/docs-json', '/api/docs-yaml']) {
      const res = await request(app.getHttpServer()).get(path).set('Accept', 'text/html');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/json/);
    }
  });

  it('route khác không bị ảnh hưởng', async () => {
    const res = await request(app.getHttpServer()).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
