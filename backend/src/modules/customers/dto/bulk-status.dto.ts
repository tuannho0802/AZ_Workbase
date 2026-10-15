import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BulkStatusDto {
    @ApiProperty({ example: [1, 2, 3], description: 'ID khách hàng cần đổi trạng thái (tối đa 500/lần)' })
    @IsArray()
    @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 khách hàng' })
    @ArrayMaxSize(500, { message: 'Chỉ được chọn tối đa 500 khách hàng mỗi lần' })
    @ArrayUnique()
    @IsInt({ each: true })
    @Type(() => Number)
    customerIds: number[];

    @ApiProperty({ example: 'closed', description: 'Mã trạng thái đích (bảng customer_statuses)' })
    @IsString()
    @Length(1, 50)
    status: string;
}