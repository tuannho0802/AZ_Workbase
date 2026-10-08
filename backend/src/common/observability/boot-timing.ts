import { Logger } from '@nestjs/common';

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12B] Đo thời gian KHỞI ĐỘNG (cold start) - `cpu-timing.middleware.ts`
 * chỉ đo từng request SAU khi app đã tạo xong. Chỉ bật khi `CPU_TIMING=true` (mặc định TẮT, đo xong thì tắt).
 * Mỗi cold start in đúng 1 dòng:
 *   [BootTiming] load cpu=…ms | create cpu=…ms wall=…ms | init cpu=…ms wall=…ms | total wall=…ms
 *  - load  = CPU của cả tiến trình từ lúc bắt đầu tới đầu createApp() (nạp module/`require`).
 *  - create= NestFactory.create (DI + kết nối TypeORM + map route); init = app.init().
 *  - wall >> cpu => chờ I/O (vd: DB); cpu ~ wall => tính toán thật.
 * ⚠️ `process.cpuUsage()` tính cho CẢ tiến trình: nếu request khác chạy song song lúc boot thì số cpu có thể lẫn.
 */
export interface BootMark {
    cpu: NodeJS.CpuUsage;
    t: bigint;
}

export interface BootStep {
    cpuMs: number;
    wallMs: number;
}

export const isBootTimingEnabled = (): boolean => process.env.CPU_TIMING === 'true';

export function bootMark(): BootMark {
    return { cpu: process.cpuUsage(), t: process.hrtime.bigint() };
}

/** Thời gian từ `from` tới hiện tại. */
export function bootStep(from: BootMark): BootStep {
    const used = process.cpuUsage(from.cpu);
    return {
        cpuMs: (used.user + used.system) / 1000,
        wallMs: Number(process.hrtime.bigint() - from.t) / 1e6,
    };
}

export function formatBootTiming(loadCpuMs: number, create: BootStep, init: BootStep, totalWallMs: number): string {
    const f = (s: BootStep) => `cpu=${s.cpuMs.toFixed(0)}ms wall=${s.wallMs.toFixed(0)}ms`;
    return `load cpu=${loadCpuMs.toFixed(0)}ms | create ${f(create)} | init ${f(init)} | total wall=${totalWallMs.toFixed(0)}ms`;
}

export function logBootTiming(loadCpuMs: number, create: BootStep, init: BootStep, totalWallMs: number): void {
    new Logger('BootTiming').log(formatBootTiming(loadCpuMs, create, init, totalWallMs));
}