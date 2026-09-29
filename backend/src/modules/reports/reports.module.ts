import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { User } from '../../database/entities/user.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { ReportsService } from './reports.service';
import { ReportsMarketingService } from './reports-marketing.service';
import { ReportsCustomerListService } from './reports-customer-list.service';
import { ReportsCustomerDetailService } from './reports-customer-detail.service';
import { ReportsGroupQualityService } from './reports-group-quality.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerGroupMembership, CustomerStatus, User, LinkGroup, LinkCategory])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsMarketingService, ReportsCustomerListService, ReportsCustomerDetailService, ReportsGroupQualityService],
  exports: [ReportsService],
})
export class ReportsModule { }