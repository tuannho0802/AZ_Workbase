import { IsArray, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ManagedLinkDto } from './managed-link.dto';

export class UpdateUserProfileDto {
  @ApiProperty({
    type: [ManagedLinkDto],
    description:
      'Danh sách Fanpage/Group mà user quản lý. Gửi cả mảng để thay thế (replace) toàn bộ profile hiện tại.',
    example: [
      {
        type: 'fanpage',
        name: 'AZ Land - Fanpage chính',
        url: 'https://facebook.com/az.land',
      },
      {
        type: 'group',
        name: 'AZ Land - Group nội bộ',
        url: 'https://facebook.com/groups/azland',
      },
    ],
  })
  @IsArray({ message: 'profile phải là một mảng' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 link mỗi user' })
  @ValidateNested({ each: true })
  @Type(() => ManagedLinkDto)
  profile: ManagedLinkDto[];
}
