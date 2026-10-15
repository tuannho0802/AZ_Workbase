import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, Post, UseGuards } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IpAccessApiLogInterceptor } from './ip-access-api-log.interceptor';
import { IpAccessApiLogService } from './ip-access-api-log.service';
import { SecurityModule } from './security.module';

/** Giả JwtAuthGuard: có header `x-test-user` thì gắn req.user, không thì 401 (giống guard thật: chạy TRƯỚC interceptor). */
@Injectable()
class FakeAuthGuard implements CanActivate {
    canActivate(ctx: ExecutionContext) {
        const req = ctx.switchToHttp().getRequest();
        const id = req.headers['x-test-user'];
        if (!id) return false;
        req.user = { id: Number(id) };
        return true;
    }
}

@Controller('customers')
@UseGuards(FakeAuthGuard)
class CustomersController {
    @Get(':id')
    one(@Param('id') id: string) {
        return { id };
    }

    @Post()
    create(@Body() b: unknown) {
        return b ?? {};
    }

    @Post('search')
    @HttpCode(200)
    search() {
        return [];
    }

    @Get('boom/x')
    boom(): never {
        throw new Error('lỗi lạ');
    }
}

@Controller('link-groups')
@UseGuards(FakeAuthGuard)
class LinkGroupsController {
    @Get()
    list() {
        return [];
    }
}

@Controller('system-cron')
@UseGuards(FakeAuthGuard)
class SystemCronController {
    @Post('run')
    run() {
        return { ok: true };
    }
}

@Controller('public')
class PublicController {
    @Get('ping')
    ping() {
        return { ok: true };
    }
}

/**
 * Dựng pipeline Nest THẬT (global prefix `api`, guard, global interceptor đăng ký qua APP_INTERCEPTOR đúng như
 * SecurityModule) để chắc các giả định: route mẫu lấy từ `req.route.path`, guard chạy trước interceptor, mã 201 của POST.
 */
describe('Log request API — tích hợp với pipeline Nest thật (3.6.2)', () => {
    let app: NestExpressApplication;
    let record: jest.Mock;

    beforeAll(async () => {
        record = jest.fn().mockResolvedValue(undefined);
        const moduleRef = await Test.createTestingModule({
            controllers: [CustomersController, LinkGroupsController, SystemCronController, PublicController],
            providers: [
                { provide: IpAccessApiLogService, useValue: { record } },
                { provide: APP_INTERCEPTOR, useClass: IpAccessApiLogInterceptor },
            ],
        }).compile();
        app = moduleRef.createNestApplication<NestExpressApplication>();
        app.setGlobalPrefix('api');
        app.set('trust proxy', 1);
        await app.init();
    });
    afterAll(async () => {
        await app.close();
    });
    beforeEach(() => record.mockClear());

    const http = () => request(app.getHttpServer());

    it('GET có id: lưu route MẪU, không lưu giá trị id / query', async () => {
        const res = await http().get('/api/customers/98765?token=SECRET&phone=0901234567').set('x-test-user', '7').set('user-agent', 'UA-1');
        expect(res.status).toBe(200);
        expect(record).toHaveBeenCalledTimes(1);
        const arg = record.mock.calls[0][0];
        expect(arg).toMatchObject({ userId: 7, endpointGroup: 'customers', endpoint: 'GET /customers/:id', status: 200, userAgent: 'UA-1' });
        const dumped = JSON.stringify(arg);
        for (const secret of ['98765', 'SECRET', 'token', '0901234567', '?']) expect(dumped).not.toContain(secret);
    });

    it('POST mặc định -> status 201 (Nest gán sau interceptor nhưng last_status vẫn đúng)', async () => {
        const res = await http().post('/api/customers').set('x-test-user', '7').send({ name: 'A' });
        expect(res.status).toBe(201);
        expect(record.mock.calls[0][0]).toMatchObject({ endpoint: 'POST /customers', status: 201 });
    });

    it('POST có @HttpCode(200) -> 200', async () => {
        const res = await http().post('/api/customers/search').set('x-test-user', '7').send({});
        expect(res.status).toBe(200);
        expect(record.mock.calls[0][0]).toMatchObject({ endpoint: 'POST /customers/search', status: 200 });
    });

    it('nhóm endpoint theo tên controller (kebab-case)', async () => {
        await http().get('/api/link-groups').set('x-test-user', '7');
        expect(record.mock.calls[0][0]).toMatchObject({ endpointGroup: 'link-groups', endpoint: 'GET /link-groups' });
    });

    it('handler ném lỗi lạ: client nhận 500 như bình thường và vẫn ghi lượt với status 500', async () => {
        const res = await http().get('/api/customers/boom/x').set('x-test-user', '7');
        expect(res.status).toBe(500);
        expect(record).toHaveBeenCalledTimes(1);
        expect(record.mock.calls[0][0].status).toBe(500);
    });

    it('chưa đăng nhập: guard chặn (403) -> KHÔNG ghi', async () => {
        const res = await http().get('/api/customers/1');
        expect(res.status).toBe(403);
        expect(record).not.toHaveBeenCalled();
    });

    it('route không có guard/không có req.user -> KHÔNG ghi', async () => {
        const res = await http().get('/api/public/ping');
        expect(res.status).toBe(200);
        expect(record).not.toHaveBeenCalled();
    });

    it('endpoint cron (system-cron) -> KHÔNG ghi', async () => {
        const res = await http().post('/api/system-cron/run').set('x-test-user', '7');
        expect(res.status).toBe(201);
        expect(record).not.toHaveBeenCalled();
    });

    it('OPTIONS (preflight) -> KHÔNG ghi', async () => {
        await http().options('/api/customers/1').set('x-test-user', '7');
        expect(record).not.toHaveBeenCalled();
    });

    it('lỗi ghi log (record reject) không làm hỏng response', async () => {
        record.mockRejectedValueOnce(new Error('DB down'));
        const res = await http().get('/api/customers/5').set('x-test-user', '7');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: '5' });
    });

    it('IP lấy từ req.ip (trust proxy 1 -> phần tử cuối X-Forwarded-For do edge gắn), KHÔNG tin x-az-client-ip', async () => {
        await http().get('/api/customers/5').set('x-test-user', '7').set('x-forwarded-for', '203.0.113.9').set('x-az-client-ip', '6.6.6.6');
        expect(record.mock.calls[0][0].ip).toBe('203.0.113.9');
    });
});

describe('SecurityModule — đăng ký global interceptor (3.6.2)', () => {
    it('providers có IpAccessApiLogService và APP_INTERCEPTOR -> IpAccessApiLogInterceptor', () => {
        const providers: Array<unknown> = Reflect.getMetadata('providers', SecurityModule);
        expect(providers).toContain(IpAccessApiLogService);
        expect(providers).toContainEqual({ provide: APP_INTERCEPTOR, useClass: IpAccessApiLogInterceptor });
    });
});
