import { Controller, Get, Logger, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
@Controller('keep-alive')
export class KeepAliveController {
    private readonly logger = new Logger(KeepAliveController.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    @Get()
    async ping(@Req() req: Request) {
        try {
        // Nếu connection bị drop, initialize lại
        if (!this.dataSource.isInitialized) {
            this.logger.warn('DataSource not initialized, reconnecting...');
            await this.dataSource.initialize();
        }

        const result = await this.dataSource.query('SELECT 1 as alive');
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