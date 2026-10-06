import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { isTransientDbError } from '../utils/db-transient-error.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void | Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Mất kết nối DB tạm thời -> 503 (FE biết là tạm thời, có thể thử lại) thay vì 500 mơ hồ.
    const isDbTransient = !(exception instanceof HttpException) && isTransientDbError(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : isDbTransient
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[];

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as any).message
          : exception.message;
    } else if (isDbTransient) {
      message = 'Hệ thống đang bận, vui lòng thử lại sau giây lát';
    } else {
      message = 'Internal server error';
    }

    // Lỗi nghiệp vụ "hỏi lại để xác nhận" (vd Guard checklist 409) cần FE đọc được `code` + số liệu kèm theo.
    // Chỉ chuyển tiếp khi exception có khai báo `code` -> mọi lỗi cũ giữ nguyên hình dạng response.
    let businessCode: Record<string, unknown> = {};
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      if (typeof raw === 'object' && raw !== null && typeof (raw as { code?: unknown }).code === 'string') {
        const { statusCode: _s, error: _e, message: _m, ...extra } = raw as Record<string, unknown>;
        businessCode = extra;
      }
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
      ...businessCode,
    };

    // [PERF/Fluid CPU] [AGENT] OLD CODE (giữ lại để rollback): MỌI lỗi (kể cả 401/403/400) đều
    // console.error kèm toàn bộ stack (~15 dòng). Khi access token hết hạn, FE bắn ~8 request song
    // song -> 8 lần dựng + ghi stack chỉ cho lỗi người dùng bình thường.
    //   console.error('[EXCEPTION FILTER] Error:', { status, path: request.url, message,
    //     stack: exception instanceof Error ? exception.stack : null });
    // NEW: 5xx giữ nguyên (cần stack để debug). 401 không log (Vercel đã ghi status + path của từng
    // request, và đây là luồng refresh token bình thường). Các 4xx khác chỉ 1 dòng, không stack.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('[EXCEPTION FILTER] Error:', {
        status,
        path: request.url,
        message,
        stack: exception instanceof Error ? exception.stack : null,
      });
    } else if (status !== HttpStatus.UNAUTHORIZED) {
      const text = Array.isArray(message) ? message.join('; ') : message;
      this.logger.warn(`${status} ${request.method} ${request.url} - ${text}`);
    }

    // PLAN_HARDENING P5: chỉ gửi lỗi 5xx lên Sentry - KHÔNG gửi 4xx
    // (401/403/validation là lỗi người dùng, gửi lên chỉ gây nhiễu).
    // Dữ liệu được lọc PII ở `beforeSend` (xem instrument.ts).
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception);

      // Vercel serverless có thể đóng băng hàm ngay sau khi response kết thúc
      // -> event chưa kịp gửi đi. Trên Vercel: đợi flush (tối đa 2s) rồi mới
      // trả response; môi trường khác thì gửi nền như bình thường.
      if (process.env.VERCEL === '1') {
        return Sentry.flush(2000)
          .catch(() => false)
          .then(() => {
            response.status(status).json(errorResponse);
          });
      }
    }

    response.status(status).json(errorResponse);
  }
}
