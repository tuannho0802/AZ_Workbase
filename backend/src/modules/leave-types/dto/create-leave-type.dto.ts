import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, IsBoolean, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CreateLeaveTypeDto {
  @ApiProperty({
    example: 'meet_client',
    description:
      'Mã bất biến sau khi tạo, là giá trị THẬT được lưu vào leave_requests.leave_type - chỉ chữ thường/số/gạch dưới',
  })
  @IsNotEmpty({ message: 'Mã loại phép không được để trống' })
  @IsString({ message: 'Mã loại phép phải là chuỗi' })
  @MaxLength(50, { message: 'Mã loại phép tối đa 50 ký tự' })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Mã loại phép chỉ được chứa chữ thường, số và dấu gạch dưới (vd: meet_client)',
  })
  code: string;

  @ApiProperty({ example: 'Gặp khách', description: 'Tên hiển thị' })
  @IsNotEmpty({ message: 'Tên loại phép không được để trống' })
  @IsString({ message: 'Tên loại phép phải là chuỗi' })
  @MaxLength(100, { message: 'Tên loại phép tối đa 100 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Nhân viên ra ngoài gặp khách trong giờ làm việc' })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string;

  @ApiPropertyOptional({
    example: '#1890ff',
    description: 'Mã màu hex hiển thị Tag loại phép ngoài FE, để trống sẽ dùng màu mặc định',
  })
  @IsOptional()
  @IsString({ message: 'Màu phải là chuỗi' })
  @Matches(HEX_COLOR_REGEX, { message: 'Màu phải là mã hex hợp lệ, vd #1890ff hoặc #fff' })
  color?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Hưởng lương hay không - quyết định ký hiệu chấm công: true = P (cả ngày)/X-2 (nửa ngày), ' +
      'false = KL (cả ngày)/1-2K (nửa ngày)',
  })
  @IsOptional()
  @IsBoolean({ message: 'isPaid phải là boolean' })
  isPaid?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Có trừ vào số ngày phép năm còn lại (annualLeaveBalance) khi đơn được duyệt hay không',
  })
  @IsOptional()
  @IsBoolean({ message: 'deductsAnnualBalance phải là boolean' })
  deductsAnnualBalance?: boolean;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị (nhỏ hơn hiện trước), mặc định 0' })
  @IsOptional()
  @IsInt({ message: 'sortOrder phải là số nguyên' })
  @Type(() => Number)
  sortOrder?: number;
}
