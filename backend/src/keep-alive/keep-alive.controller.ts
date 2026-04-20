import { Controller, Get, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('keep-alive')
export class KeepAliveController {
    private readonly logger = new Logger(KeepAliveController.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    @Get()
    async ping() {
        try {
        // Nếu connection bị drop, initialize lại
        if (!this.dataSource.isInitialized) {
            this.logger.warn('DataSource not initialized, reconnecting...');
            await this.dataSource.initialize();
        }

        const result = await this.dataSource.query('SELECT 1 as alive');
        const timestamp = new Date().toISOString();

        this.logger.log(`✅ Keep-alive ping OK at ${timestamp}`);
        return {
            status: 'ok',
            message: 'Backend and database are alive.',
            db: result[0],
            timestamp,
        };
    } catch (error) {
          this.logger.error(`❌ Keep-alive failed: ${error.message}`);

          // Thử reconnect
          try {
              if (this.dataSource.isInitialized) {
                  await this.dataSource.destroy();
              }
              await this.dataSource.initialize();
              return { status: 'reconnected', message: 'DB reconnected successfully.' };
          } catch (reconnectError) {
              return { status: 'error', message: `DB reconnect failed: ${reconnectError.message}` };
          }
      }
  }
}