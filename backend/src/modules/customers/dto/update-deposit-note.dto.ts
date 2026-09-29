import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Chỉ cho sửa GHI CHÚ của phiếu nạp. Cố ý KHÔNG có `amount`/`depositDate`/
 * `broker`: số tiền là cố định (sai thì Xoá rồi nạp lại). `main.ts` bật
 * `whitelist + forbidNonWhitelisted` nên gửi thêm bất kỳ field nào khác
 * (vd `amount`) -> 400, không thể lách qua endpoint này.
 */
export class UpdateDepositNoteDto {
  @ApiProperty({
    example: 'Nạp lần 2 - mã GD 123',
    description: 'Ghi chú mới. Chuỗi rỗng = xoá ghi chú.',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Ghi chú nạp tối đa 1000 ký tự' })
  note?: string;
}
