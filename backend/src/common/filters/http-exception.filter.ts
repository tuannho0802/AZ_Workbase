import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void | Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[];

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as any).message
          : exception.message;
    } else {
      message = 'Internal server error';
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
    };

    // Log error for debugging (Tiếng Việt)
    console.error('[EXCEPTION FILTER] Error:', {
      status,
      path: request.url,
      message,
      stack: exception instanceof Error ? exception.stack : null,
    });

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
