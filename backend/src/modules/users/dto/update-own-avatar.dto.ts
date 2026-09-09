import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOwnAvatarDto {
  @ApiProperty({ example: 'avatars/12/a1b2c3.webp', description: 'Object key vừa PUT lên B2' })
  @IsString()
  @IsNotEmpty()
  key: string;
}
