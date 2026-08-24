import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

/**
 * Set Cache-Control cho response GET.
 *
 * Có 2 chế độ:
 * - Mặc định (revalidate = false): "public, max-age=N" — cache mù trong N
 *   giây, KHÔNG hỏi lại server, dù data đã đổi hay chưa. Phù hợp cho data
 *   ít khi thay đổi (departments...). Không phù hợp cho resource bị sửa
 *   liên tục (customers) vì có thể trả data cũ ngay sau khi vừa cập nhật —
 *   xem lịch sử: từng gây bug "vừa sửa Marketing xong, bảng chưa hiện, phải
 *   Ctrl+Shift+R mới thấy".
 * - revalidate = true: "private, no-cache" — trình duyệt vẫn LƯU response,
 *   nhưng bắt buộc phải hỏi lại server (gửi kèm If-None-Match) trước khi
 *   dùng bản lưu đó. Nếu data server trả về có ETag trùng khớp (Express tự
 *   sinh weak ETag theo nội dung response), server trả 304 Not Modified
 *   (không gửi lại body) -> vẫn tiết kiệm băng thông, nhưng KHÔNG BAO GIỜ
 *   trả data cũ vì server luôn tính lại ETag từ data mới nhất trước khi so
 *   sánh. Dùng cho resource hay bị sửa mà vẫn muốn giữ lợi ích cache.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(
    private readonly maxAge: number = 60,
    private readonly revalidate: boolean = false,
  ) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        // Chỉ cache GET requests
        if (request.method === 'GET') {
          response.setHeader(
            'Cache-Control',
            this.revalidate
              ? 'private, no-cache'
              : `public, max-age=${this.maxAge}, stale-while-revalidate=120`,
          );
        }
      }),
    );
  }
}