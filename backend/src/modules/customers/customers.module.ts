import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersService } from './customers.service';
import { CustomersImportService } from './customers.import.service';
import { CustomersController } from './customers.controller';
import { Customer } from './entities/customer.entity';
import { CustomerNote } from './entities/customer-note.entity';
import { User } from '../users/entities/user.entity';
import { DepositsModule } from '../deposits/deposits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, User, CustomerNote]),
    DepositsModule
  ],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersImportService],
  exports: [CustomersService],
})
export class CustomersModule {}
