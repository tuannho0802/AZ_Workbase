import { IsNumber, IsDateString, IsString, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWithdrawalDto {
  @ApiProperty({ example: 500.5, description: 'Số tiền rút (USD)' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Số tiền phải là số (tối đa 2 chữ số thập phân)' })
  @Min(0.01, { message: 'Số tiền phải lớn hơn 0' })
  @Max(999999999.99, { message: 'Số tiền vượt quá giới hạn cho phép' })
  amount: number;

  @ApiProperty({ example: '2026-11-02', description: 'Ngày rút tiền' })
  @IsDateString({}, { message: 'Ngày không hợp lệ' })
  withdrawalDate: string;

  @ApiProperty({ example: 'XM Global', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Sàn tối đa 100 ký tự' })
  broker?: string;

  @ApiProperty({ example: 'Khách rút lần 1', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Ghi chú rút tối đa 1000 ký tự' })
  note?: string;
}
