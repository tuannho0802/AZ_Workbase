import { Module } from '@nestjs/common';
import { BulkOperationsService } from './bulk-operations.service';
import { BulkOperationsController } from './bulk-operations.controller';

// AuditModule và PermissionsModule đều @Global(); DataSource do TypeOrmModule.forRoot cung cấp toàn cục.
@Module({
    controllers: [BulkOperationsController],
    providers: [BulkOperationsService],
    exports: [BulkOperationsService],
})
export class BulkOperationsModule { }