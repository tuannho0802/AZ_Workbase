import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkGroupSecondaryManager } from '../../database/entities/link-group-secondary-manager.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { LinkCategoriesService } from './link-categories.service';
import { LinkCategoriesController } from './link-categories.controller';
import { LinkGroupsService } from './link-groups.service';
import { LinkGroupsController } from './link-groups.controller';
import { LinkGroupManagersService } from './link-group-managers.service';
import { LinkGroupManagersController } from './link-group-managers.controller';
import { CustomerGroupMembershipsService } from './customer-group-memberships.service';
import { CustomerGroupMembershipsController } from './customer-group-memberships.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LinkCategory,
      LinkGroup,
      LinkGroupSecondaryManager,
      CustomerGroupMembership,
      Customer,
      User,
    ]),
  ],
  controllers: [
    LinkCategoriesController,
    LinkGroupsController,
    LinkGroupManagersController,
    CustomerGroupMembershipsController,
  ],
  providers: [
    LinkCategoriesService,
    LinkGroupsService,
    LinkGroupManagersService,
    CustomerGroupMembershipsService,
  ],
  exports: [
    LinkCategoriesService,
    LinkGroupsService,
    LinkGroupManagersService,
    CustomerGroupMembershipsService,
  ],
})
export class LinkGroupsModule { }