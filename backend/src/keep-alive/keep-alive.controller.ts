import { Controller, Get, Logger, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** Hai ping HEAD cách nhau dưới ngần này (ms) trên cùng instance chỉ chạy 1 SELECT 1. */
const KEEPALIVE_DEDUPE_MS = 15_000;
@Controller('keep-alive')
export class KeepAliveController {
    private readonly logger = new Logger(KeepAliveController.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    private lastOk: { at: number; result: unknown } | null = null;
    private inflight: Promise<unknown> | null = null;

    /** Single-flight + cache thành công ngắn hạn; lỗi KHÔNG được cache (lần sau thử lại thật). */
    private pingDedupe(): Promise<unknown> {
        if (this.lastOk && Date.now() - this.lastOk.at < KEEPALIVE_DEDUPE_MS) return Promise.resolve(this.lastOk.result);
        if (!this.inflight) {
            this.inflight = this.dataSource
                .query('SELECT 1 as alive')
                .then((r: unknown) => {
                    this.lastOk = { at: Date.now(), result: r };
                    return r;
                })
                .finally(() => {
                    this.inflight = null;
                });
        }
        return this.inflight;
    }

    @Get()
    async ping(@Req() req: Request) {
        try {
        // Nếu connection bị drop, initialize lại
        if (!this.dataSource.isInitialized) {
            this.logger.warn('DataSource not initialized, reconnecting...');
            await this.dataSource.initialize();
        }

        // [AGENT] OLD CODE (giữ lại để rollback): const result = await this.dataSource.query('SELECT 1 as alive');
        // NEW: HEAD (Uptime monitor) trùng nhau trong KEEPALIVE_DEDUPE_MS trên CÙNG instance thì dùng lại kết quả
        // SELECT 1 vừa thành công / đang bay (không mở thêm connection TLS tới Aiven). GET thủ công luôn kiểm tra thật.
        const result = req.method === 'HEAD' ? await this.pingDedupe() : await this.dataSource.query('SELECT 1 as alive');
        const timestamp = new Date().toISOString();

            // [AGENT] OLD CODE (giữ lại để rollback): this.logger.log(`✅ Keep-alive ping OK at ${timestamp}`);
            // NEW (PLAN CPU Mục 7B): Uptime monitor gọi HEAD ~5 phút/lần -> bỏ log mỗi lần (ghi log tốn CPU). GET thủ công vẫn log; lỗi luôn log.
            if (req.method !== 'HEAD') {
                this.logger.log(`✅ Keep-alive ping OK at ${timestamp}`);
            }
        return {
            status: 'ok',
            message: 'Backend and database are alive.',
            db: result[0],
            timestamp,
        };
    } catch (error) {
            this.logger.error(`❌ Keep-alive failed: ${errMsg(error)}`);

          // Thử reconnect
          try {
              if (this.dataSource.isInitialized) {
                  await this.dataSource.destroy();
              }
              await this.dataSource.initialize();
              return { status: 'reconnected', message: 'DB reconnected successfully.' };
          } catch (reconnectError) {
              return { status: 'error', message: `DB reconnect failed: ${errMsg(reconnectError)}` };
          }
      }
  }
}