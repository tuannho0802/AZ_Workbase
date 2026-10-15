import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';
import {
    IpAccessApiLogInterceptor,
    isExcludedApiPath,
    successStatus,
    toEndpointGroup,
    toRouteTemplate,
} from './ip-access-api-log.interceptor';

class CustomersController { }
class LinkGroupsController { }

type Req = Record<string, unknown>;

function makeCtx(req: Req, opts: { type?: string; klass?: Function; handler?: Function } = {}) {
    const handler = opts.handler ?? function handle() { };
    return {
        getType: () => opts.type ?? 'http',
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 200 }) }),
        getClass: () => opts.klass ?? CustomersController,
        getHandler: () => handler,
    } as any;
}

const authedReq = (over: Req = {}): Req => ({
    method: 'GET',
    path: '/api/customers/12345',
    url: '/api/customers/12345?token=SECRET&phone=0901234567',
    route: { path: '/api/customers/:id' },
    user: { id: 7 },
    ip: '8.8.8.8',
    headers: { 'user-agent': 'Mozilla/5.0', 'x-vercel-ip-country': 'US' },
    ...over,
});

describe('isExcludedApiPath (bộ loại trừ)', () => {
    it.each([
        ['OPTIONS', '/api/customers'],
        ['options', '/api/customers'],
        ['GET', '/api/docs'],
        ['GET', '/api/docs/'],
        ['GET', '/api/docs/swagger-ui.css'],
        ['GET', '/docs'],
        ['GET', '/api/docs-json'],
        ['GET', '/api/docs-yaml'],
        ['GET', '/api/health'],
        ['GET', '/health/live'],
        ['GET', '/api/keep-alive'],
        ['POST', '/api/system-cron/run'],
        ['GET', '/api/periodic-tasks-cron/auto-overdue'],
        ['GET', '/api/zk-device-cron/sync'],
        ['GET', '/api/some-cron'],
        ['POST', '/api/auth/login'],
        ['POST', '/api/auth/login/'],
        ['POST', '/api/auth/refresh'],
        ['POST', '/AUTH/LOGIN'], // không phân biệt hoa/thường
    ])('%s %s -> loại trừ', (method, path) => {
        expect(isExcludedApiPath(method, path)).toBe(true);
    });

    it('thiếu method hoặc path -> loại trừ (an toàn)', () => {
        expect(isExcludedApiPath(undefined, '/api/customers')).toBe(true);
        expect(isExcludedApiPath('GET', undefined)).toBe(true);
        expect(isExcludedApiPath('GET', '')).toBe(true);
    });

    it.each([
        ['GET', '/api/customers'],
        ['GET', '/api/customers/12'],
        ['POST', '/api/auth/logout'], // chỉ login/refresh là loại trừ
        ['GET', '/api/auth/sessions'],
        ['GET', '/api/auth/me'],
        ['GET', '/api/documents'], // "docs" là tiền tố của tên khác -> KHÔNG loại trừ
        ['GET', '/api/healthcare'], // tương tự health
        ['GET', '/api/users/cron-settings'], // "cron" không nằm cuối đoạn
        ['PATCH', '/api/users/5'],
    ])('%s %s -> có log', (method, path) => {
        expect(isExcludedApiPath(method, path)).toBe(false);
    });

    it('phần query bị cắt khi xét loại trừ (không để query đánh lừa)', () => {
        expect(isExcludedApiPath('GET', '/api/docs?x=1')).toBe(true);
        expect(isExcludedApiPath('GET', '/api/customers?next=/api/docs')).toBe(false);
    });
});

describe('toEndpointGroup / toRouteTemplate / successStatus', () => {
    it('tên controller -> kebab-case, bỏ hậu tố Controller', () => {
        expect(toEndpointGroup('CustomersController')).toBe('customers');
        expect(toEndpointGroup('LinkGroupsController')).toBe('link-groups');
        expect(toEndpointGroup('PeriodicTasksPerformanceController')).toBe('periodic-tasks-performance');
        expect(toEndpointGroup('X'.repeat(100) + 'Controller').length).toBeLessThanOrEqual(60);
    });

    it('route mẫu: bỏ tiền tố /api, giữ tham số :id, KHÔNG bao giờ là giá trị thật', () => {
        expect(toRouteTemplate('get', '/api/customers/:id', 'customers')).toBe('GET /customers/:id');
        expect(toRouteTemplate('PATCH', '/api/users/:id/unlock-login', 'users')).toBe('PATCH /users/:id/unlock-login');
        expect(toRouteTemplate('GET', '/customers', 'customers')).toBe('GET /customers');
        expect(toRouteTemplate('GET', '/api', 'customers')).toBe('GET /');
    });

    it('không có route mẫu (regex, undefined, không bắt đầu bằng /) -> rơi về `/<nhóm>`, không dùng URL thô', () => {
        expect(toRouteTemplate('GET', /^\/x/, 'customers')).toBe('GET /customers');
        expect(toRouteTemplate('GET', undefined, 'customers')).toBe('GET /customers');
        expect(toRouteTemplate('GET', 'customers/:id', 'customers')).toBe('GET /customers');
    });

    it('route mẫu dài bị cắt ≤ 80 ký tự', () => {
        expect(toRouteTemplate('GET', '/api/' + 'a'.repeat(300), 'g').length).toBeLessThanOrEqual(80);
    });

    it('mã HTTP khi thành công: POST mặc định 201, còn lại 200, @HttpCode ưu tiên', () => {
        expect(successStatus('GET', undefined)).toBe(200);
        expect(successStatus('POST', undefined)).toBe(201);
        expect(successStatus('post', undefined)).toBe(201);
        expect(successStatus('PATCH', undefined)).toBe(200);
        expect(successStatus('DELETE', undefined)).toBe(200);
        expect(successStatus('POST', 200)).toBe(200);
        expect(successStatus('GET', 204)).toBe(204);
        expect(successStatus('POST', 'abc')).toBe(201);
        expect(successStatus(undefined, undefined)).toBe(200);
    });
});

describe('IpAccessApiLogInterceptor', () => {
    let apiLog: { record: jest.Mock };
    let interceptor: IpAccessApiLogInterceptor;

    beforeEach(() => {
        apiLog = { record: jest.fn().mockResolvedValue(undefined) };
        interceptor = new IpAccessApiLogInterceptor(apiLog as any);
    });

    const run = (ctx: any, value: unknown = { ok: true }) =>
        firstValueFrom(interceptor.intercept(ctx, { handle: () => of(value) }));

    it('request đã đăng nhập: ghi 1 lần SAU khi handler xong, với route mẫu + nhóm + user + IP + quốc gia + UA', async () => {
        const out = await run(makeCtx(authedReq()), { id: 12345 });
        expect(out).toEqual({ id: 12345 }); // response không bị đổi
        expect(apiLog.record).toHaveBeenCalledTimes(1);
        expect(apiLog.record).toHaveBeenCalledWith({
            ip: '8.8.8.8',
            countryCode: 'US',
            userId: 7,
            endpointGroup: 'customers',
            endpoint: 'GET /customers/:id',
            status: 200,
            userAgent: 'Mozilla/5.0',
        });
    });

    it('URL thô / query string / giá trị id / token KHÔNG BAO GIỜ được truyền đi lưu', async () => {
        await run(makeCtx(authedReq()));
        const sent = JSON.stringify(apiLog.record.mock.calls);
        expect(sent).not.toContain('12345');
        expect(sent).not.toContain('SECRET');
        expect(sent).not.toContain('token=');
        expect(sent).not.toContain('0901234567');
        expect(sent).not.toContain('?');
    });

    it('nhóm endpoint lấy theo tên controller (LinkGroupsController -> link-groups)', async () => {
        await run(makeCtx(authedReq({ route: { path: '/api/link-groups/:id' } }), { klass: LinkGroupsController }));
        expect(apiLog.record.mock.calls[0][0]).toMatchObject({ endpointGroup: 'link-groups', endpoint: 'GET /link-groups/:id' });
    });

    it('chỉ tin req.ip: header x-az-client-ip do client tự gắn KHÔNG được dùng (chống giả IP né log)', async () => {
        await run(makeCtx(authedReq({ headers: { 'x-az-client-ip': '6.6.6.6', 'user-agent': 'ua' } })));
        expect(apiLog.record.mock.calls[0][0].ip).toBe('8.8.8.8');
    });

    it('header quốc gia lạ / thiếu -> countryCode null; thiếu user-agent -> null', async () => {
        await run(makeCtx(authedReq({ headers: { 'x-vercel-ip-country': 'XX' } })));
        expect(apiLog.record.mock.calls[0][0]).toMatchObject({ countryCode: null, userAgent: null });
    });

    describe('mã trạng thái', () => {
        it('POST thành công -> 201', async () => {
            await run(makeCtx(authedReq({ method: 'POST', route: { path: '/api/customers' }, path: '/api/customers' })));
            expect(apiLog.record.mock.calls[0][0].status).toBe(201);
        });
        it('POST có @HttpCode(200) -> 200', async () => {
            const handler = function h() { };
            Reflect.defineMetadata(HTTP_CODE_METADATA, 200, handler);
            await run(makeCtx(authedReq({ method: 'POST' }), { handler }));
            expect(apiLog.record.mock.calls[0][0].status).toBe(200);
        });
        it('GET -> 200', async () => {
            await run(makeCtx(authedReq()));
            expect(apiLog.record.mock.calls[0][0].status).toBe(200);
        });
    });

    describe('KHÔNG ghi', () => {
        it('request chưa đăng nhập (không có req.user)', async () => {
            await run(makeCtx(authedReq({ user: undefined })));
            expect(apiLog.record).not.toHaveBeenCalled();
        });
        it.each([['chuỗi', '7'], ['null', null], ['số lẻ', 1.5], ['đối tượng rỗng', {}]])('req.user.id không phải số nguyên (%s)', async (_n, id) => {
            await run(makeCtx(authedReq({ user: { id } })));
            expect(apiLog.record).not.toHaveBeenCalled();
        });
        it('OPTIONS (preflight)', async () => {
            await run(makeCtx(authedReq({ method: 'OPTIONS' })));
            expect(apiLog.record).not.toHaveBeenCalled();
        });
        it.each(['/api/docs', '/api/health', '/api/system-cron/run', '/api/auth/login', '/api/auth/refresh'])('đường loại trừ %s', async (path) => {
            await run(makeCtx(authedReq({ path, url: path })));
            expect(apiLog.record).not.toHaveBeenCalled();
        });
        it('context không phải HTTP (ws/rpc)', async () => {
            await run(makeCtx(authedReq(), { type: 'rpc' }));
            expect(apiLog.record).not.toHaveBeenCalled();
        });
        it('request loại trừ vẫn trả đúng dữ liệu (interceptor trong suốt)', async () => {
            expect(await run(makeCtx(authedReq({ method: 'OPTIONS' })), 'data')).toBe('data');
        });
    });

    describe('handler ném lỗi', () => {
        const runErr = (err: unknown, req: Req = authedReq()) =>
            lastValueFrom(interceptor.intercept(makeCtx(req), { handle: () => throwError(() => err) }));

        it('vẫn ghi lượt truy cập với đúng mã của HttpException, rồi ném lại CHÍNH lỗi đó', async () => {
            const err = new NotFoundException('không có');
            await expect(runErr(err)).rejects.toBe(err);
            expect(apiLog.record).toHaveBeenCalledTimes(1);
            expect(apiLog.record.mock.calls[0][0].status).toBe(404);
        });
        it.each([
            [new BadRequestException(), 400],
            [new ForbiddenException(), 403],
        ])('mã %#', async (err, code) => {
            await expect(runErr(err)).rejects.toBe(err);
            expect(apiLog.record.mock.calls[0][0].status).toBe(code);
        });
        it('lỗi không phải HttpException -> ghi 500, ném lại nguyên lỗi', async () => {
            const err = new Error('lỗi lạ');
            await expect(runErr(err)).rejects.toBe(err);
            expect(apiLog.record.mock.calls[0][0].status).toBe(500);
        });
        it('request loại trừ + lỗi -> không ghi, lỗi vẫn ném', async () => {
            const err = new Error('x');
            await expect(runErr(err, authedReq({ method: 'OPTIONS' }))).rejects.toBe(err);
            expect(apiLog.record).not.toHaveBeenCalled();
        });
    });

    describe('lỗi ghi log KHÔNG làm hỏng request', () => {
        it('record() reject khi handler thành công -> response vẫn trả bình thường', async () => {
            apiLog.record.mockRejectedValue(new Error('DB down'));
            await expect(run(makeCtx(authedReq()), { ok: 1 })).resolves.toEqual({ ok: 1 });
        });
        it('record() reject khi handler lỗi -> vẫn ném ĐÚNG lỗi gốc của handler (không bị thay bằng lỗi log)', async () => {
            apiLog.record.mockRejectedValue(new Error('DB down'));
            const err = new ForbiddenException('cấm');
            await expect(
                lastValueFrom(interceptor.intercept(makeCtx(authedReq()), { handle: () => throwError(() => err) })),
            ).rejects.toBe(err);
        });
        it('record() ném đồng bộ (không phải Promise reject) cũng được nuốt', async () => {
            apiLog.record.mockImplementation(() => {
                throw new Error('sync boom');
            });
            await expect(run(makeCtx(authedReq()), 'v')).resolves.toBe('v');
        });
    });

    it('chờ record() xong rồi mới trả response (không fire-and-forget, vì serverless có thể cắt tác vụ nền)', async () => {
        let done = false;
        apiLog.record.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20));
            done = true;
        });
        await run(makeCtx(authedReq()));
        expect(done).toBe(true);
    });
});
