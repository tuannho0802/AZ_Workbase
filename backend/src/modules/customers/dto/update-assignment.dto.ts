import { IsOptional, IsInt, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateAssignmentDto {
    @ApiPropertyOptional({
        example: 7,
        description: 'Đổi người nhận gán (Sales User ID mới) - để trống nếu chỉ đổi lý do',
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    assignedToId?: number;

    @ApiPropertyOptional({
        example: 'Đổi lý do gán',
        description: 'Sửa lý do gán - để trống nếu chỉ đổi người nhận',
    })
    @IsOptional()
    @IsString()
    reason?: string;
}