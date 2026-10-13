import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DepartmentsController } from '../../modules/departments/departments.controller';
import { DepartmentsService } from '../../modules/departments/departments.service';
import { PositionsController } from '../../modules/positions/positions.controller';
import { PositionsService } from '../../modules/positions/positions.service';
import { RolesController } from '../../modules/roles/roles.controller';
import { RolesService } from '../../modules/roles/roles.service';
import { UsersController } from '../../modules/users/users.controller';
import { UsersService } from '../../modules/users/users.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { REF_DATA_HTTP_MAX_AGE_S } from './cache-control.interceptor';

/**
 * Bảo vệ hồi quy: 3 danh mục ít đổi PHẢI giữ `refDataCache()` (cache cứng CHỈ khi có `?v=` - khoá phiên bản do FE gắn từ
 * userId/epoch/nonce/refSig, xem frontend/src/lib/api/ref-cache-version.ts). Epoch (Reset hệ thống) nằm trong `v` nên Reset
 * đổi URL => bỏ bản cũ. Thiếu `v` => `private, no-cache` (luôn hỏi lại). `/users/me` TUYỆT ĐỐI không được cache HTTP.
 */
describe('Cache-Control của danh mục ít đổi (HTTP)', () => {
  let app: INestApplication;
  const ok = { canActivate: () => true };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [DepartmentsController, PositionsController, RolesController, UsersController],
      providers: [
        { provide: DepartmentsService, useValue: { findAll: async () => [{ id: 1 }] } },
        { provide: PositionsService, useValue: { findAll: async () => [{ id: 1 }] } },
        { provide: RolesService, useValue: { findAllColors: async () => [{ id: 1, color: '#fff' }] } },
        { provide: UsersService, useValue: { findById: async () => ({ id: 1, name: 'A' }), signAvatarUrl: async (u: unknown) => u } },
      ],
    })
      .useMocker(() => ({}))
      .overrideGuard(JwtAuthGuard).useValue(ok)
      .overrideGuard(PermissionGuard).useValue(ok)
      .compile();
    app = mod.createNestApplication();
    app.use((req: any, _res: any, next: any) => { req.user = { id: 1, role: 'employee' }; next(); });
    await app.init();
  });
  afterAll(() => app.close());

  const routes = ['/departments', '/positions', '/roles/colors'];

  it.each(routes)('GET %s?v=... -> private, max-age=1800 (không public, không CDN)', async (path) => {
    const res = await request(app.getHttpServer()).get(`${path}?v=7.0.0.0`).expect(200);
    expect(res.headers['cache-control']).toBe(`private, max-age=${REF_DATA_HTTP_MAX_AGE_S}`);
  });

  it.each(routes)('GET %s không có ?v= -> private, no-cache (luôn hỏi lại)', async (path) => {
    const res = await request(app.getHttpServer()).get(path).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('GET /users/me KHÔNG được gắn Cache-Control cứng (hồ sơ/avatar ký URL đổi theo từng lần gọi)', async () => {
    for (const q of ['', '?v=7.0.0.0']) {
      const res = await request(app.getHttpServer()).get(`/users/me${q}`).expect(200);
      const cc = String(res.headers['cache-control'] ?? '');
      expect(cc).not.toMatch(/max-age=[1-9]/);
      expect(cc).not.toContain('public');
    }
  });
});
