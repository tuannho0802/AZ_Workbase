import { Controller, Get, Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { createSwaggerBasicAuth } from './swagger-basic-auth.middleware';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

/**
 * Dựng đúng thứ tự như main.ts (app.use(middleware) TRƯỚC SwaggerModule.setup) với SwaggerModule thật,
 * để chắc chắn mọi route Swagger sinh ra đều đi qua Basic auth - kể cả -json, -yaml và file init.
 */
describe('Swagger + Basic auth (PLAN_HARDENING P4) - tích hợp', () => {
  let app: NestExpressApplication;
  const auth = 'Basic ' + Buffer.from('admin@example.com:Good').toString('base64');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.use(
      createSwaggerBasicAuth({
        verify: async (email, pw) => email === 'admin@example.com' && pw === 'Good',
      }),
    );
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('t').build());
    SwaggerModule.setup('api/docs', app, doc);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/api/docs', '/api/docs-json', '/api/docs-yaml', '/api/docs/swagger-ui-init.js'])(
    'không đăng nhập: %s -> 401 + WWW-Authenticate',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
    },
  );

  it.each(['/api/docs', '/api/docs-json', '/api/docs-yaml', '/api/docs/swagger-ui-init.js'])(
    'đăng nhập đúng: %s -> 200',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path).set('Authorization', auth);
      expect(res.status).toBe(200);
    },
  );

  it('API thường không bị ảnh hưởng', async () => {
    const res = await request(app.getHttpServer()).get('/api/ping');
    expect(res.status).toBe(200);
  });
});
