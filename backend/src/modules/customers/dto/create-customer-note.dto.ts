import { IsString, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerNoteDto {
  @ApiProperty({ 
    example: 'Khách hàng quan tâm đến gói VIP',
    description: 'Nội dung ghi chú'
  })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @MinLength(1, { message: 'Ghi chú không được để trống' })
  note: string;

  @ApiProperty({ 
    enum: ['general', 'call', 'meeting', 'follow_up'],
    default: 'general',
    required: false
  })
  @IsOptional()
  @IsEnum(['general', 'call', 'meeting', 'follow_up'], {
    message: 'Loại ghi chú không hợp lệ'
  })
  noteType?: string;

  @ApiProperty({ 
    example: false,
    default: false,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  isImportant?: boolean;
}
