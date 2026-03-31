import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
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
}
