import { IsOptional, IsNumber, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetAuditLogsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiProperty({ required: false, description: 'Lọc theo user ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number;

  @ApiProperty({ required: false, description: 'Lọc theo action (VD: CREATE_CUSTOMER)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({ required: false, description: 'Lọc theo entity type (customer, user, deposit...)' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiProperty({ required: false, description: 'Từ ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ required: false, description: 'Đến ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({ required: false, description: 'Tìm kiếm theo tên người thực hiện' })
  @IsOptional()
  @IsString()
  search?: string;
}
