import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, Length, ValidateNested } from 'class-validator';
import { BroadcastAudienceDto } from './audience.dto';

/** Giới hạn độ dài theo PLAN nguyên tắc 8 (thủ công: title <=200, body <=2000). */
export class SendBroadcastDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  body: string;

  @ApiProperty({ type: BroadcastAudienceDto })
  @ValidateNested()
  @Type(() => BroadcastAudienceDto)
  audience: BroadcastAudienceDto;
}

/** Preview dùng chung shape audience - không ghi DB, chỉ tính số người nhận. */
export class PreviewBroadcastDto {
  @ApiProperty({ type: BroadcastAudienceDto })
  @ValidateNested()
  @Type(() => BroadcastAudienceDto)
  audience: BroadcastAudienceDto;
}
