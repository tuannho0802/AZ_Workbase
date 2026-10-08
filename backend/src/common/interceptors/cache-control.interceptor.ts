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
    // [AGENT] NEW: true = "private, max-age=N" (cache mù N giây, CHỈ trình duyệt, không CDN, không stale-while-revalidate).
    // BẮT BUỘC đi kèm FE gắn `?v=` đổi khi dữ liệu đổi (xem frontend/src/lib/api/ref-cache-version.ts) - thiếu thì trả bản cũ tới N giây.
    private readonly privateVersioned: boolean = false,
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
            this.privateVersioned
              ? // [AGENT] NEW: chỉ cache cứng khi URL có `?v=` (khoá phiên bản do FE gắn). Thiếu `v` (FE cũ, gọi tay, user chưa nạp xong)
                // -> private, no-cache: luôn hỏi lại (304), KHÔNG BAO GIỜ giữ bản cũ dưới URL trần.
                request.query?.v !== undefined && request.query?.v !== ''
                ? `private, max-age=${this.maxAge}`
                : 'private, no-cache'
              : this.revalidate
              ? 'private, no-cache'
              : `public, max-age=${this.maxAge}, stale-while-revalidate=120`,
          );
        }
      }),
    );
  }
}

/** 30 phút - danh mục ít đổi; FE gắn `?v=` (refSig/epoch/nonce) nên đổi dữ liệu là tự bỏ bản cũ. */
export const REF_DATA_HTTP_MAX_AGE_S = 1800;
export const refDataCache = () => new CacheControlInterceptor(REF_DATA_HTTP_MAX_AGE_S, false, true);
