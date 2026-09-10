import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Position } from '../../database/entities/position.entity';
import { User } from '../../database/entities/user.entity';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Position, User])],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService, TypeOrmModule],
})
export class PositionsModule {}
