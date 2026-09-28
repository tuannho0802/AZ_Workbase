import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { User } from '../../database/entities/user.entity';
import { ReportsService } from './reports.service';
import { ReportsMarketingService } from './reports-marketing.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerGroupMembership, CustomerStatus, User])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsMarketingService],
  exports: [ReportsService],
})
export class ReportsModule { }