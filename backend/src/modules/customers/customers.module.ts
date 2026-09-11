import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersService } from './customers.service';
import { CustomersImportService } from './customers.import.service';
import { CustomersController } from './customers.controller';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { CustomerAssignment } from '../../database/entities/customer-assignment.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { User } from '../../database/entities/user.entity';
import { DepositsModule } from '../deposits/deposits.module';
import { Deposit } from '../../database/entities/deposit.entity';
import { UiVisibilityModule } from '../ui-visibility/ui-visibility.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, User, CustomerNote, CustomerAssignment, CustomerGroupMembership, Deposit, CustomerStatus]),
    DepositsModule,
    UiVisibilityModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersImportService],
  exports: [CustomersService],
})
export class CustomersModule { }