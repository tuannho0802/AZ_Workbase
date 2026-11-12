import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FANPAGE_HEATMAP_MAX_WEEKS, FANPAGE_STATS_MAX_COMPARE, METRIC_MAX_VALUE } from '../helpers/fanpage-metrics.helper';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = 'Ngày phải có dạng YYYY-MM-DD';

/** `?pageIds=1,2,3` hoặc `?pageIds=1&pageIds=2` -> [1,2,3]. Chuỗi rỗng -> []. */
const toIdArray = ({ value }: { value: unknown }): unknown => {
    if (value === undefined || value === null) return undefined;
    const parts = (Array.isArray(value) ? value : String(value).split(',')).map((s) => String(s).trim()).filter((s) => s !== '');
    return parts.map(Number);
};

/** 4 chỉ số nhập tay. `undefined` = giữ nguyên giá trị cũ, `null` = xoá giá trị đó (ô để trống ở lưới thì KHÔNG gửi). */
export class MetricValuesDto {
    @ApiPropertyOptional({ description: 'Số follower/like Page' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Followers phải là số nguyên' })
    @Min(0, { message: 'Followers không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Followers quá lớn' })
    followers?: number | null;

    @ApiPropertyOptional({ description: 'Lượt tiếp cận' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Reach phải là số nguyên' })
    @Min(0, { message: 'Reach không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Reach quá lớn' })
    reach?: number | null;

    @ApiPropertyOptional({ description: 'Lượt tương tác' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Tương tác phải là số nguyên' })
    @Min(0, { message: 'Tương tác không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Tương tác quá lớn' })
    engagement?: number | null;

    @ApiPropertyOptional({ description: 'Lượt xem' })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Lượt xem phải là số nguyên' })
    @Min(0, { message: 'Lượt xem không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Lượt xem quá lớn' })
    views?: number | null;

    @ApiPropertyOptional()
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @Length(0, 255, { message: 'Ghi chú tối đa 255 ký tự' })
    note?: string | null;
}

export class UpsertSnapshotDto extends MetricValuesDto {
    @ApiPropertyOptional({
        description:
            '`updatedAt` của dòng lúc bạn đọc (null = lúc đọc CHƯA có dòng). Có gửi và dòng đã bị người khác sửa -> 409 (X24). Bỏ trống = ghi đè.',
        nullable: true,
    })
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    expectedUpdatedAt?: string | null;

    @ApiPropertyOptional({ description: 'true = vẫn lưu dù followers giảm >50% so với lần nhập trước (đã xác nhận không gõ nhầm)' })
    @IsOptional()
    @IsBoolean()
    confirmDrop?: boolean;
}

export class BulkSnapshotRowDto extends UpsertSnapshotDto {
    @ApiProperty()
    @IsInt()
    @Min(1)
    fanpageId: number;
}

export class BulkSnapshotDto {
    @ApiProperty({ example: '2026-11-12', description: 'Ngày số liệu (YYYY-MM-DD, giờ VN) áp cho mọi dòng' })
    @Matches(DATE_RE, { message: DATE_MSG })
    date: string;

    @ApiProperty({ type: [BulkSnapshotRowDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'Cần ít nhất 1 dòng' })
    @ArrayMaxSize(200, { message: 'Tối đa 200 dòng mỗi lần lưu' })
    @ValidateNested({ each: true })
    @Type(() => BulkSnapshotRowDto)
    rows: BulkSnapshotRowDto[];
}

export class GridQueryDto {
    @ApiPropertyOptional({ example: '2026-11-12', description: 'Ngày số liệu muốn nhập. Mặc định: hôm nay.' })
    @IsOptional()
    @Matches(DATE_RE, { message: DATE_MSG })
    date?: string;
}

export class SnapshotListQueryDto {
    @ApiPropertyOptional({ example: '2026-08-01' })
    @IsOptional()
    @Matches(DATE_RE, { message: DATE_MSG })
    from?: string;

    @ApiPropertyOptional({ example: '2026-11-12' })
    @IsOptional()
    @Matches(DATE_RE, { message: DATE_MSG })
    to?: string;
}

export class SetTargetDto {
    @ApiProperty({ nullable: true, description: 'Follower muốn TĂNG THÊM trong tháng. null = bỏ mục tiêu tháng này.' })
    @ValidateIf((_o, v) => v !== null)
    @IsInt({ message: 'Mục tiêu phải là số nguyên' })
    @Min(0, { message: 'Mục tiêu không được âm' })
    @Max(METRIC_MAX_VALUE, { message: 'Mục tiêu quá lớn' })
    targetFollowerGain: number | null;
}

export class HeatmapQueryDto {
    @ApiPropertyOptional({ example: 12, description: `Số tuần (1-${FANPAGE_HEATMAP_MAX_WEEKS}), mặc định 12` })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(FANPAGE_HEATMAP_MAX_WEEKS)
    weeks?: number;
}

export class StatsRangeQueryDto {
    @ApiPropertyOptional({ example: '2026-10-14', description: 'Từ ngày (YYYY-MM-DD, giờ VN). Mặc định: 30 ngày gần nhất.' })
    @IsOptional()
    @Matches(DATE_RE, { message: DATE_MSG })
    from?: string;

    @ApiPropertyOptional({ example: '2026-11-12', description: 'Đến ngày (không ở tương lai). Mặc định: hôm nay.' })
    @IsOptional()
    @Matches(DATE_RE, { message: DATE_MSG })
    to?: string;
}

export class GrowthQueryDto extends StatsRangeQueryDto {
    @ApiPropertyOptional({ enum: ['week', 'month'], description: 'Gom theo tuần/tháng. Mặc định: >92 ngày -> tháng, ngược lại -> tuần.' })
    @IsOptional()
    @Matches(/^(week|month)$/, { message: 'groupBy phải là week hoặc month' })
    groupBy?: 'week' | 'month';

    @ApiPropertyOptional({ example: '1,2,3', description: `Page muốn vẽ riêng để so sánh (tối đa ${FANPAGE_STATS_MAX_COMPARE}). Page ngoài phạm vi bị bỏ qua.` })
    @IsOptional()
    @Transform(toIdArray)
    @IsArray()
    @ArrayMaxSize(FANPAGE_STATS_MAX_COMPARE, { message: `Chỉ so sánh tối đa ${FANPAGE_STATS_MAX_COMPARE} Page` })
    @IsInt({ each: true })
    @Min(1, { each: true })
    pageIds?: number[];
}

export class TopPostsQueryDto extends StatsRangeQueryDto {
    @ApiPropertyOptional({ example: 10, description: 'Số bài tối đa (1-50), mặc định 10' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}