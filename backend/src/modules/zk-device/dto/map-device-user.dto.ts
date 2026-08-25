import { IsInt, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MapDeviceUserDto {
  @ApiProperty({ description: 'ID nhân viên trong hệ thống (users.id)' })
  @IsInt()
  userId: number;

  @ApiProperty({
    description: 'Mã "User ID" trên máy chấm công (trường userId trong getUsers(), không phải uid nội bộ máy)',
    example: '44',
  })
  @IsString()
  @IsNotEmpty()
  deviceUserId: string;
}
