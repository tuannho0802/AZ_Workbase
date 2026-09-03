import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Xác minh token Cloudflare Turnstile (widget CAPTCHA-less chống bot) gửi
 * lên từ Frontend qua endpoint `siteverify` chính thức của Cloudflare.
 *
 * Dùng `fetch` có sẵn của Node 18+ (KHÔNG cần thêm dependency `axios` chỉ để
 * gọi 1 endpoint duy nhất - xem `package.json`, backend hiện chưa có axios).
 */
@Injectable()
export class TurnstileService {
    private readonly logger = new Logger(TurnstileService.name);

    constructor(private readonly configService: ConfigService) { }

    /**
     * Trả về `true` nếu token hợp lệ.
     *
     * ⚠️ Hành vi khi CHƯA cấu hình `TURNSTILE_SECRET_KEY` (vd môi trường dev
     * local trước khi có site key thật từ Cloudflare Dashboard): log cảnh báo
     * 1 lần và coi như PASS (không chặn đăng ký) - tránh việc quên set env làm
     * sập hẳn tính năng đăng ký trên môi trường chưa kịp cấu hình. Khi lên
     * production BẮT BUỘC phải set biến này, nếu không toàn bộ lớp bảo vệ
     * Turnstile coi như tắt (chỉ còn rate-limit + honeypot).
     */
    async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
        const secretKey = this.configService.get<string>('TURNSTILE_SECRET_KEY');

        if (!secretKey) {
            this.logger.warn(
                '[Turnstile] TURNSTILE_SECRET_KEY chưa được cấu hình - BỎ QUA xác minh Turnstile ' +
                '(chỉ còn rate-limit + honeypot chống bot). Cấu hình biến này trước khi lên production.',
            );
            return true;
        }

        if (!token) {
            return false;
        }

        try {
            const body = new URLSearchParams({ secret: secretKey, response: token });
            if (remoteIp) body.set('remoteip', remoteIp);

            const res = await fetch(SITEVERIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });

            if (!res.ok) {
                this.logger.warn(`[Turnstile] siteverify trả về HTTP ${res.status} - coi như thất bại`);
                return false;
            }

            const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };

            if (!data.success) {
                this.logger.debug(`[Turnstile] Xác minh thất bại: ${JSON.stringify(data['error-codes'] ?? [])}`);
            }

            return data.success === true;
        } catch (error) {
            // Lỗi mạng/timeout khi gọi Cloudflare: KHÔNG để lỗi hạ tầng chặn hết
            // người dùng thật, nhưng vẫn log rõ để biết Cloudflare đang gặp sự cố -
            // trả `false` (chặn) an toàn hơn `true` (mở toang) khi không chắc chắn.
            this.logger.error(`[Turnstile] Lỗi khi gọi siteverify: ${(error as Error).message}`);
            return false;
        }
    }
}