import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';
import { IsOptional, IsDateString, IsNumber, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại' })
  @IsOptional()
  @Matches(/^((09|08|07|03|05)[0-9]{8}|MISSING_[0-9]+)$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày nhập data (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày nhập không đúng định dạng YYYY-MM-DD' })
  inputDate?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày sales nhận khách (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày nhận không đúng định dạng YYYY-MM-DD' })
  assignedDate?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày chốt (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày chốt không đúng định dạng YYYY-MM-DD' })
  closedDate?: string;

  @ApiPropertyOptional({ description: 'ID của nhân viên Sales phụ trách' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  salesUserId?: number | null;
}
