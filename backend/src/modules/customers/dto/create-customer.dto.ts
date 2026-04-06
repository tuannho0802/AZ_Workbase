import { IsString, IsNotEmpty, Length, Matches, IsOptional, IsEmail, IsEnum, IsInt, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên khách hàng' })
  @IsString({ message: 'Họ tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ tên là bắt buộc' })
  @Length(1, 100, { message: 'Họ tên phải từ 1 đến 100 ký tự' })
  name: string;

  @ApiProperty({ example: '0901234567', description: 'Số điện thoại (10 số, bắt đầu bằng 09/08/07/03/05)' })
  @IsNotEmpty({ message: 'Số điện thoại là bắt buộc' })
  @Matches(/^(09|08|07|03|05)[0-9]{8}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @ApiPropertyOptional({ example: 'nguyenvana@example.com', description: 'Email khách hàng' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiProperty({ example: 'Facebook', enum: ['Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other'], description: 'Nguồn khách hàng' })
  @IsNotEmpty({ message: 'Nguồn khách hàng là bắt buộc' })
  @IsEnum(['Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other'], { message: 'Nguồn khách hàng không hợp lệ' })
  source: string;

  @ApiPropertyOptional({ example: 'Chiến dịch Mùa Hè', description: 'Tên chiến dịch' })
  @IsOptional()
  @IsString()
  campaign?: string;

  @ApiProperty({ example: 2, description: 'ID của nhân viên Sales phụ trách' })
  @IsOptional()
  @IsInt({ message: 'ID Sales phải là số nguyên' })
  @Type(() => Number)
  salesUserId: number;

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
  departmentId: number;

  @ApiPropertyOptional({ example: '2026-03-30', description: 'Ngày nhập data (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày nhập không đúng định dạng YYYY-MM-DD' })
  inputDate?: string;

  @ApiPropertyOptional({ example: 'Khách hàng VIP cần chăm sóc kỹ', description: 'Ghi chú thêm' })
  @IsOptional()
  @IsString()
  note?: string;
}
