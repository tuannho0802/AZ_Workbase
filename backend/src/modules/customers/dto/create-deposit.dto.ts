import { IsNumber, IsDateString, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepositDto {
  @ApiProperty({ example: 1000.50, description: 'Số tiền nạp (USD)' })
  @IsNumber({}, { message: 'Số tiền phải là số' })
  @Min(0.01, { message: 'Số tiền phải lớn hơn 0' })
  amount: number;

  @ApiProperty({ example: '2026-03-31', description: 'Ngày nạp tiền' })
  @IsDateString({}, { message: 'Ngày không hợp lệ' })
  depositDate: string;

  @ApiProperty({ example: 'XM Global', required: false })
  @IsOptional()
  @IsString()
  broker?: string;

  @ApiProperty({ example: 'Ghi chú về giao dịch', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
