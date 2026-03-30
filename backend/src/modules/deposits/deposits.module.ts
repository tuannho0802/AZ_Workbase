import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deposit } from './entities/deposit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Deposit])],
  exports: [TypeOrmModule],
})
export class DepositsModule {}
