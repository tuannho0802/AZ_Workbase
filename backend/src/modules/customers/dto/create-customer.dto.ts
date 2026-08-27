import { IsString, IsNotEmpty, Length, Matches, IsOptional, IsEmail, IsEnum, IsInt, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên khách hàng' })
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ tên là bắt buộc' })
  @Length(1, 100, { message: 'Họ tên phải từ 1 đến 100 ký tự' })
  name: string;

  @ApiProperty({ example: '0901234567', description: 'Số điện thoại' })
  @IsNotEmpty({ message: 'Số điện thoại là bắt buộc' })
  @Matches(/^((09|08|07|03|05)[0-9]{8}|MISSING_[0-9]+)$/, { message: 'Số điện thoại không hợp lệ (Ví dụ: 0912345678)' })
  phone: string;

  @ApiPropertyOptional({ example: 'nguyenvana@example.com', description: 'Email khách hàng' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày sales nhận khách (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày nhận không đúng định dạng YYYY-MM-DD' })
  assignedDate?: string;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày chốt (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày chốt không đúng định dạng YYYY-MM-DD' })
  closedDate?: string;

  // ⚠️ Trước đây validate cứng bằng @IsEnum([...]) - chặn luôn mọi nguồn
  // admin tự thêm qua CRUD /media-sources vì DTO không biết tới nguồn mới.
  // Giờ chỉ validate là chuỗi hợp lệ; việc "nguồn này có tồn tại/có đang bị
  // khoá không" được CustomersService kiểm tra khi tạo (xem create() - đối
  // chiếu với bảng media_sources, cho thông báo lỗi rõ ràng hơn nếu sai).
  @ApiProperty({ example: 'Facebook', description: 'Tên nguồn khách hàng - phải khớp 1 nguồn đang mở trong Quản lý nguồn (/nguon-media)' })
  @IsNotEmpty({ message: 'Nguồn khách hàng là bắt buộc' })
  @IsString({ message: 'Nguồn khách hàng phải là chuỗi' })
  @Length(1, 100, { message: 'Tên nguồn tối đa 100 ký tự' })
  source: string;

  @ApiPropertyOptional({ example: 'Chiến dịch Mùa Hè', description: 'Tên chiến dịch' })
  @IsOptional()
  @IsString()
  campaign?: string;

  @ApiProperty({ example: 2, description: 'ID của nhân viên Sales phụ trách' })
  @IsOptional()
  @IsInt({ message: 'ID Sales phải là số nguyên' })
  @Type(() => Number)
  salesUserId?: number | null;

  @ApiPropertyOptional({ example: 3, description: 'ID của nhân viên Marketing phụ trách' })
  @IsOptional()
  @IsInt({ message: 'ID Marketing phải là số nguyên' })
  @Type(() => Number)
  marketingUserId?: number | null;

  @ApiPropertyOptional({ example: 'pending', enum: ['closed', 'pending', 'potential', 'lost', 'inactive'], description: 'Trạng thái khách hàng' })
  @IsOptional()
  @IsEnum(['closed', 'pending', 'potential', 'lost', 'inactive'], { message: 'Trạng thái không hợp lệ' })
  status?: string;

  @ApiPropertyOptional({ example: 'Exness', description: 'Sàn môi giới' })
  @IsOptional()
  @IsString()
  broker?: string;

  @ApiProperty({ example: 1, description: 'ID của phòng ban' })
  @IsOptional()
  @IsInt({ message: 'ID phòng ban phải là số nguyên' })
  @Type(() => Number)
  departmentId?: number | null;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày nhập data (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày nhập không đúng định dạng YYYY-MM-DD' })
  inputDate?: string;

  @ApiPropertyOptional({ example: 'Khách hàng VIP cần chăm sóc kỹ', description: 'Ghi chú thêm' })
  @IsOptional()
  @IsString()
  note?: string;
}