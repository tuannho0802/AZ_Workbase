import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export const MAX_UTMS_PER_PAGE = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `PUT /fanpages/:id/utms` - thay TOÀN BỘ tập UTM của Page (rỗng = gỡ hết). */
export class SetFanpageUtmsDto {
    @ApiProperty({ type: [Number], description: 'Danh sách UTM gắn cho Page (thay toàn bộ)' })
    @IsArray()
    @ArrayMaxSize(MAX_UTMS_PER_PAGE, { message: `Tối đa ${MAX_UTMS_PER_PAGE} UTM cho 1 Page` })
    @ArrayUnique({ message: 'UTM bị trùng' })
    @Type(() => Number)
    @IsInt({ each: true, message: 'UTM không hợp lệ' })
    utmIds: number[];
}

/** `GET /fanpages/stats/outcomes` (cùng kỳ với các khối Thống kê khác). */
export class OutcomesQueryDto {
    @ApiPropertyOptional({ example: '2026-11-01' })
    @IsOptional()
    @Matches(DATE_RE, { message: 'Từ ngày không hợp lệ (YYYY-MM-DD)' })
    from?: string;

    @ApiPropertyOptional({ example: '2026-11-30' })
    @IsOptional()
    @Matches(DATE_RE, { message: 'Đến ngày không hợp lệ (YYYY-MM-DD)' })
    to?: string;
}

/** `GET /fanpages/stats/outcomes/customers` - danh sách khách khi bấm số khách ở bảng Page → Khách. */
export class OutcomeCustomersQueryDto extends OutcomesQueryDto {
    @ApiProperty({ enum: ['primary', 'participating'], description: 'primary = ghi công · participating = Page tham gia (dùng chung)' })
    @IsIn(['primary', 'participating'])
    kind: 'primary' | 'participating';

    @ApiProperty()
    @Type(() => Number)
    @IsInt()
    fanpageId: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Length(0, 30)
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @Length(0, 100)
    search?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ default: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;
}