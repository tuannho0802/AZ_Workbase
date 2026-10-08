import { ConsoleLogger } from '@nestjs/common';

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12A] Mỗi cold start Nest in ~245 dòng `LOG` lúc khởi động
 * (`RouterExplorer Mapped {...}`, `InstanceLoader ... initialized`, `RoutesResolver ...`). Trên Vercel,
 * mỗi dòng bị gán cho TỪNG request đang chờ instance -> log nhân bản (4 request x ~245 = ~1000 dòng/giây)
 * và ghi log cũng tốn CPU. Logger này chỉ bỏ các dòng `log` của đúng các context khởi động đó;
 * `warn`/`error`/`debug` và log nghiệp vụ (`new Logger(XService.name)`) giữ nguyên.
 *
 * Bật lại khi cần debug khởi động (route không map, lỗi DI): đặt env `NEST_BOOT_LOG=true`.
 * Không dùng `logger: ['error','warn']` vì sẽ mất toàn bộ `this.logger.log(...)` nghiệp vụ.
 */
export const BOOT_LOG_CONTEXTS: ReadonlySet<string> = new Set([
    'InstanceLoader',
    'RouterExplorer',
    'RoutesResolver',
    'NestFactory',
    'NestApplication',
]);

export class QuietBootLogger extends ConsoleLogger {
    log(message: any, ...optionalParams: any[]) {
        // Nest luôn nối context vào CUỐI optionalParams (xem Logger#log).
        const context = optionalParams[optionalParams.length - 1];
        if (
            process.env.NEST_BOOT_LOG !== 'true' &&
            typeof context === 'string' &&
            BOOT_LOG_CONTEXTS.has(context)
        ) {
            return;
        }
        super.log(message, ...optionalParams);
    }
}