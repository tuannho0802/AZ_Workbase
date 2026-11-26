import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CopyPositionOverrideTargetDto {
  @ApiProperty({ example: 2, description: 'Role đích (có thể khác Role nguồn)' })
  @IsInt()
  roleId: number;

  @ApiProperty({ example: 5, description: 'Vị trí đích' })
  @IsInt()
  positionId: number;
}

export class CopyPositionOverrideDto {
  // Override đã có của mỗi đích sẽ bị THAY THẾ hoàn toàn bằng bản sao của nguồn (không merge).
  @ApiProperty({ type: [CopyPositionOverrideTargetDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CopyPositionOverrideTargetDto)
  targets: CopyPositionOverrideTargetDto[];
}
