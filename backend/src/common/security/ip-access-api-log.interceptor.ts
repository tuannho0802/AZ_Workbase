import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { getClientCountry, getDirectClientIp } from './client-ip';
import { ApiHitInput, IpAccessApiLogService } from './ip-access-api-log.service';

type ReqLike = {
    method?: string;
    path?: string;
    url?: string;
    route?: { path?: unknown };
    user?: { id?: unknown };
    headers?: Record<string, unknown>;
    ip?: string;
};

/** Đường KHÔNG log: preflight, tài liệu API, health, cron (xác thực bằng secret), và chính login/refresh (đã log riêng). */
export function isExcludedApiPath(method: string | undefined, rawPath: string | undefined): boolean {
    if (!method || method.toUpperCase() === 'OPTIONS') return true;
    // Chỉ dùng để LOẠI TRỪ — phần query bị cắt và KHÔNG bao giờ được lưu.
    const path = (rawPath ?? '').split('?')[0].toLowerCase();
    if (!path) return true;
    if (/^\/(api\/)?docs(-json|-yaml)?(\/|$)/.test(path)) return true;
    if (/^\/(api\/)?(health|keep-alive)(\/|$)/.test(path)) return true;
    if (path.includes('-cron/') || path.endsWith('-cron')) return true;
    if (/^\/(api\/)?auth\/(login|refresh)\/?$/.test(path)) return true;
    return false;
}

/** `LinkGroupsController` -> `link-groups`. */
export function toEndpointGroup(controllerName: string): string {
    return controllerName
        .replace(/Controller$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .slice(0, 60);
}

/** Route MẪU: `GET /customers/:id` (bỏ tiền tố `/api`). Không có route mẫu -> `GET /<nhóm>`; KHÔNG dùng URL thô. */
export function toRouteTemplate(method: string, routePath: unknown, group: string): string {
    let pattern = typeof routePath === 'string' && routePath.startsWith('/') ? routePath : `/${group}`;
    pattern = pattern.replace(/^\/api(?=\/|$)/, '') || '/';
    return `${method.toUpperCase()} ${pattern}`.slice(0, 80);
}

/**
 * Mã HTTP khi handler thành công. Nest chỉ gán mã (201 cho POST, hoặc `@HttpCode`) SAU khi interceptor chạy xong,
 * nên `res.statusCode` lúc này còn là mặc định 200 — tự suy ra để `last_status` đúng.
 */
export function successStatus(method: string | undefined, httpCode: unknown): number {
    if (typeof httpCode === 'number' && Number.isInteger(httpCode)) return httpCode;
    return (method ?? '').toUpperCase() === 'POST' ? 201 : 200;
}

/**
 * P3.6 mục 3.6.2 — global interceptor ghi lượt truy cập API đã đăng nhập. Chạy SAU mọi guard (nên đã có `req.user`),
 * không nhét vào `JwtStrategy.validate()` (đường nóng). Việc ghi `await` trong response (serverless có thể cắt tác vụ
 * chạy nền sau khi trả lời) nhưng chỉ request ĐẦU của mỗi thùng 1 phút mới chạm DB; lỗi ghi bị nuốt trong service.
 */
@Injectable()
export class IpAccessApiLogInterceptor implements NestInterceptor {
    constructor(private readonly apiLog: IpAccessApiLogService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') return next.handle();
        const http = context.switchToHttp();
        const req = http.getRequest<ReqLike>();
        const userId = req?.user?.id;
        if (typeof userId !== 'number' || !Number.isInteger(userId)) return next.handle();
        if (isExcludedApiPath(req.method, req.path ?? req.url)) return next.handle();

        const group = toEndpointGroup(context.getClass().name);
        const ua = req.headers?.['user-agent'];
        const base = {
            ip: getDirectClientIp(req),
            countryCode: getClientCountry(req),
            userId,
            endpointGroup: group,
            endpoint: toRouteTemplate(req.method as string, req.route?.path, group),
            userAgent: typeof ua === 'string' ? ua : null,
        };
        const okStatus = successStatus(req.method, Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()));

        return next.handle().pipe(
            mergeMap(async (value) => {
                await this.safeRecord({ ...base, status: okStatus });
                return value;
            }),
            catchError((err) => {
                const status = err instanceof HttpException ? err.getStatus() : 500;
                return from(this.safeRecord({ ...base, status })).pipe(mergeMap(() => throwError(() => err)));
            }),
        );
    }

    /** `record()` đã tự nuốt lỗi; bọc thêm lần nữa vì log KHÔNG BAO GIỜ được làm hỏng (hay đổi mã lỗi của) request thật. */
    private async safeRecord(input: ApiHitInput): Promise<void> {
        try {
            await this.apiLog.record(input);
        } catch {
            // nuốt: xem comment trên
        }
    }
}