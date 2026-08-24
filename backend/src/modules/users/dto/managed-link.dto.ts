import { IsEnum, IsString, IsUrl, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManagedLinkDto {
  @ApiProperty({ enum: ['fanpage', 'group'], example: 'fanpage' })
  @IsEnum(['fanpage', 'group'], {
    message: 'Loại link phải là fanpage hoặc group',
  })
  type: 'fanpage' | 'group';

  @ApiProperty({ example: 'AZ Land - Fanpage chính' })
  @IsString({ message: 'Tên phải là chuỗi ký tự' })
  @Length(1, 255, { message: 'Tên phải có độ dài 1-255 ký tự' })
  name: string;

  @ApiProperty({ example: 'https://facebook.com/az.land' })
  @IsUrl({}, { message: 'URL không hợp lệ' })
  url: string;
}
