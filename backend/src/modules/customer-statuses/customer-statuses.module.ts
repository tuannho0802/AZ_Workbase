import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatusesService } from './customer-statuses.service';
import { CustomerStatusesController } from './customer-statuses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerStatus, Customer])],
  controllers: [CustomerStatusesController],
  providers: [CustomerStatusesService],
  exports: [CustomerStatusesService],
})
export class CustomerStatusesModule {}
