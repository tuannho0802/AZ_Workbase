import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';
import { IsOptional, IsDateString, IsNumber, Matches, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNotFutureDateVn } from '../../../common/validators/is-not-future-date-vn.validator';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  // ⚠️ FIX BUG THẬT: cùng lý do với CreateCustomerDto - @IsOptional() không
  // bỏ qua chuỗi rỗng '', nên khi Sửa khách hàng và XOÁ trắng ô SĐT (Form
  // Ant Design gửi lên phone: ''), request PATCH bị chặn 400 "Số điện thoại
  // không hợp lệ" dù UI ghi rõ "(Tuỳ chọn)" và service phía dưới vốn đã tự
  // chuyển '' thành null khi lưu (xem CustomersService.update()). Dùng
  // @ValidateIf để bỏ qua @Matches() khi phone rỗng/undefined/null.
  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại (không bắt buộc)' })
  @ValidateIf((o) => !!o.phone && o.phone.trim() !== '')
  @Matches(/^((09|08|07|03|05)[0-9]{8}|MISSING_[0-9]+)$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày nhập data (YYYY-MM-DD). Không được lớn hơn ngày hiện tại (giờ Việt Nam, GMT+7).' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày nhập không đúng định dạng YYYY-MM-DD' })
  @IsNotFutureDateVn({ message: 'Ngày nhập data không được lớn hơn ngày hiện tại' })
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

  @ApiPropertyOptional({ description: 'ID của nhân viên Marketing phụ trách' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  marketingUserId?: number | null;
}