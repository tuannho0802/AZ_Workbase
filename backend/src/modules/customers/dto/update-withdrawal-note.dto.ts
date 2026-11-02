import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Chỉ cho sửa GHI CHÚ phiếu rút (giống UpdateDepositNoteDto). Số tiền/ngày/sàn cố định - sai thì Xoá rồi tạo lại.
 * `main.ts` bật whitelist + forbidNonWhitelisted nên gửi thêm field khác -> 400.
 */
export class UpdateWithdrawalNoteDto {
  @ApiProperty({ example: 'Rút về ví', description: 'Ghi chú mới. Chuỗi rỗng = xoá ghi chú.', required: false })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Ghi chú rút tối đa 1000 ký tự' })
  note?: string;
}
