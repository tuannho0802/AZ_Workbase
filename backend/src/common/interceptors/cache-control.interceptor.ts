import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly maxAge: number = 60) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        // Chỉ cache GET requests
        if (request.method === 'GET') {
          response.setHeader(
            'Cache-Control',
            `public, max-age=${this.maxAge}, stale-while-revalidate=120`,
          );
        }
      }),
    );
  }
}
