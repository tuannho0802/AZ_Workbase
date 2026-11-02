import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deposit } from '../../database/entities/deposit.entity';
import { Withdrawal } from '../../database/entities/withdrawal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Deposit, Withdrawal])],
  exports: [TypeOrmModule],
})
export class DepositsModule {}
