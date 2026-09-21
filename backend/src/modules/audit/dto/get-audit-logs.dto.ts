import { IsOptional, IsNumber, IsString, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetAuditLogsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, description: 'Tối đa 100/trang' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
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

  @ApiProperty({ required: false, description: 'Loại trừ entity type (VD: "auth" để ẩn log đăng nhập khỏi tab chính)' })
  @IsOptional()
  @IsString()
  excludeEntityType?: string;

  @ApiProperty({ required: false, description: 'Từ ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ required: false, description: 'Đến ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({
    required: false,
    description:
      'Tìm theo TÊN KHÁCH HÀNG (đối tượng bị tác động) - tách riêng khỏi `userId` (lọc chính xác người ' +
      'thực hiện qua dropdown FE, xem `SalesUserSelect`). Trước đây field này (`search`) tìm đồng thời cả ' +
      'user.name OR customer.name - đã bỏ nhánh user.name vì FE giờ dùng userId chính xác thay vì gõ tên.',
  })
  @IsOptional()
  @IsString()
  customerSearch?: string;
}