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

  // ⚠️ MỚI - Vị trí (Position), tuỳ chọn (xem PLAN mục 2.6) - đối xứng với
  // departmentId ở trên, cùng dựa vào FK `fk_users_position` để chặn ID sai.
  @ApiProperty({ example: 1, required: false, nullable: true, description: 'ID vị trí (Position), tuỳ chọn' })
  @IsOptional()
  @IsInt()
  positionId?: number | null;

  // ⚠️ MỚI (migration AddLeaveApproverOverrideToUsers1781700000000) - ngoại
  // lệ duyệt nghỉ phép, TÁCH BIỆT với departmentId ở trên (không ảnh hưởng
  // module nào khác ngoài Nghỉ phép). null = xoá ngoại lệ (quay về rule
  // phòng ban mặc định), undefined = giữ nguyên. Nên là id của 1 user role
  // Manager (không bắt buộc ở tầng validate - DB có FK `fk_users_leave_approver`
  // chặn ID bịa, còn việc chọn đúng Manager do UI Admin tự kiểm soát).
  @ApiProperty({
    example: 12,
    required: false,
    nullable: true,
    description: 'Ngoại lệ: id Manager luôn được duyệt/xem đơn nghỉ phép của user này, bất kể phòng ban',
  })
  @IsOptional()
  @IsInt()
  leaveApproverId?: number | null;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ⚠️ MỚI (migration AddIsRootAdminToUsers1781000000000) - xem JSDoc đầy đủ
  // ở create-user.dto.ts/UsersService.update(). Chỉ validate ĐỊNH DẠNG ở
  // đây - Root Admin hiện tại mới được thực sự đổi field này cho user khác.
  @ApiProperty({
    example: false,
    required: false,
    description: 'Root Admin - CHỈ Root Admin hiện tại mới được đổi field này',
  })
  @IsOptional()
  @IsBoolean({ message: 'isRootAdmin phải là kiểu boolean' })
  isRootAdmin?: boolean;

  // ⚠️ MỚI - bắt buộc khi (và CHỈ khi) `isRootAdmin` gửi kèm KHÁC giá trị
  // hiện tại của target (đổi trạng thái Root Admin) - xác nhận lại mật khẩu
  // của CHÍNH NGƯỜI GỌI (Root Admin đang thao tác), không phải mật khẩu của
  // target - cùng tinh thần `ChangePasswordDto`/`UpdateOwnEmailDto` (hành
  // động nhạy cảm -> bắt buộc nhập lại mật khẩu). Validate CÓ MẶT hay không
  // do `UsersService.update()` tự kiểm tra theo ngữ cảnh (không dùng
  // `@ValidateIf` ở đây vì điều kiện phụ thuộc giá trị CŨ trong DB, DTO
  // không tự biết được).
  @ApiProperty({
    required: false,
    description: 'Mật khẩu hiện tại của Root Admin đang thao tác - bắt buộc khi đổi isRootAdmin',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ example: 'AZ042', required: false, description: 'Mã nhân viên' })
  @IsOptional()
  @IsString({ message: 'Mã nhân viên phải là chuỗi ký tự' })
  @Matches(/^[A-Za-z0-9\-_]{1,20}$/, {
    message: 'Mã nhân viên chỉ gồm chữ, số, gạch ngang/gạch dưới, tối đa 20 ký tự',
  })
  employeeCode?: string;
}