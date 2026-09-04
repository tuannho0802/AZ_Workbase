import { IsEmail, IsString, IsInt, IsOptional, MinLength, IsBoolean, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'Nguyễn Văn A', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name?: string;

  @ApiProperty({ example: '0901234567', required: false })
  @IsOptional()
  @Matches(/^(09|08|07|03|05)[0-9]{8}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;

  // ⚠️ FIX BUG THẬT (400 "role must be one of the following values" khi gán
  // role tuỳ chỉnh): TRƯỚC ĐÂY dùng @IsEnum(['admin','manager','assistant',
  // 'employee']) - hardcode cứng 4 role hệ thống, chặn đứng mọi role tuỳ
  // chỉnh Admin tự tạo qua trang "Phân quyền" (vd "mkt_staff"). DTO giờ chỉ
  // validate ĐỊNH DẠNG (khớp đúng format `code` khi tạo role - xem
  // create-role.dto.ts), còn role đó CÓ THẬT SỰ TỒN TẠI hay không do
  // `UsersService` tự kiểm tra qua bảng `roles` (DB cũng có FK
  // `FK_users_role` chặn ở tầng cuối nếu service lỡ bỏ sót).
  @ApiProperty({
    example: 'employee',
    required: false,
    description: 'Mã role (khớp `roles.code`) - có thể là 1 trong 4 role hệ thống hoặc role tuỳ chỉnh Admin đã tạo',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'Mã role không hợp lệ' })
  role?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'AZ042', required: false, description: 'Mã nhân viên' })
  @IsOptional()
  @IsString({ message: 'Mã nhân viên phải là chuỗi ký tự' })
  @Matches(/^[A-Za-z0-9\-_]{1,20}$/, {
    message: 'Mã nhân viên chỉ gồm chữ, số, gạch ngang/gạch dưới, tối đa 20 ký tự',
  })
  employeeCode?: string;
}