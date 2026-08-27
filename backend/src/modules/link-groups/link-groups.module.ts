import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { Customer } from '../../database/entities/customer.entity';
import { LinkCategoriesService } from './link-categories.service';
import { LinkCategoriesController } from './link-categories.controller';
import { LinkGroupsService } from './link-groups.service';
import { LinkGroupsController } from './link-groups.controller';
import { CustomerGroupMembershipsService } from './customer-group-memberships.service';
import { CustomerGroupMembershipsController } from './customer-group-memberships.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkCategory, LinkGroup, CustomerGroupMembership, Customer]),
  ],
  controllers: [
    LinkCategoriesController,
    LinkGroupsController,
    CustomerGroupMembershipsController,
  ],
  providers: [LinkCategoriesService, LinkGroupsService, CustomerGroupMembershipsService],
  exports: [LinkCategoriesService, LinkGroupsService, CustomerGroupMembershipsService],
})
export class LinkGroupsModule {}
