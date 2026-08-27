import { PartialType } from '@nestjs/swagger';
import { CreateLinkCategoryDto } from './create-link-category.dto';

export class UpdateLinkCategoryDto extends PartialType(CreateLinkCategoryDto) {}
