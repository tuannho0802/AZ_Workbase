import { Logger } from '@nestjs/common';

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 13B] ĐO tần suất pool mysql2 phải TẠO KẾT NỐI MỚI (mỗi lần như vậy
 * tốn 1 lượt bắt tay TCP + TLS tới Aiven). CHỈ ĐO - không đổi `idleTimeout`/`maxIdle`/`connectionLimit`.
 * Chỉ bật khi `CPU_TIMING=true` (mặc định TẮT; khi tắt KHÔNG đăng ký listener nào).
 *
 * Mỗi lần pool phát sự kiện `connection` in đúng 1 dòng (không có host/user/password/token):
 *   [DbConnTiming] new connection #N up=…s sinceLast=…s
 *  - #N        = số kết nối mới đã tạo từ khi gắn hook (kết nối tạo lúc boot TRƯỚC khi gắn hook không được tính).
 *  - up        = giây từ khi process chạy.
 *  - sinceLast = giây từ kết nối mới trước đó (nhỏ & lặp lại ≈ idleTimeout => pool đang đóng rồi mở lại liên tục).
 * Cách đọc: đếm số dòng/giờ trong log; số cao => mới bàn nới idleTimeout (đối chiếu hành vi Aiven cắt kết nối rảnh).
 */
export const isDbConnectionTimingEnabled = (): boolean => process.env.CPU_TIMING === 'true';

/** Phần tối thiểu của pool mysql2 mà hook cần (EventEmitter). */
export interface PoolLike {
    on(event: 'connection', listener: (...args: unknown[]) => void): unknown;
}

// Tránh gắn hook nhiều lần lên cùng 1 pool (app/DataSource khởi tạo lại).
const attachedPools = new WeakSet<object>();

export function formatDbConnTiming(count: number, upSeconds: number, sinceLastSeconds: number): string {
    return `new connection #${count} up=${upSeconds.toFixed(0)}s sinceLast=${sinceLastSeconds.toFixed(0)}s`;
}

/**
 * Gắn bộ đếm lên pool. Trả `true` nếu đã gắn; `false` nếu cờ tắt, thiếu pool, hoặc đã gắn trước đó.
 * Không bao giờ throw (đo đạc không được làm hỏng app).
 */
export function attachDbConnectionTiming(pool: PoolLike | undefined | null, logger: Logger = new Logger('DbConnTiming')): boolean {
    if (!isDbConnectionTimingEnabled()) return false;
    if (!pool || typeof pool.on !== 'function' || attachedPools.has(pool)) return false;
    attachedPools.add(pool);

    let count = 0;
    let lastAt = Date.now();
    pool.on('connection', () => {
        try {
            count++;
            const now = Date.now();
            logger.log(formatDbConnTiming(count, process.uptime(), (now - lastAt) / 1000));
            lastAt = now;
        } catch {
            // nuốt lỗi: đo đạc không được ảnh hưởng luồng kết nối DB
        }
    });
    return true;
}
