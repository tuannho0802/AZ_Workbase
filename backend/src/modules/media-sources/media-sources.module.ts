import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaSource } from '../../database/entities/media-source.entity';
import { Customer } from '../../database/entities/customer.entity';
import { MediaSourcesService } from './media-sources.service';
import { MediaSourcesController } from './media-sources.controller';

@Module({
    imports: [TypeOrmModule.forFeature([MediaSource, Customer])],
    controllers: [MediaSourcesController],
    providers: [MediaSourcesService],
    exports: [MediaSourcesService],
})
export class MediaSourcesModule { }