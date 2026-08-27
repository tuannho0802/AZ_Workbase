import { PartialType } from '@nestjs/swagger';
import { CreateMediaSourceDto } from './create-media-source.dto';

export class UpdateMediaSourceDto extends PartialType(CreateMediaSourceDto) { }