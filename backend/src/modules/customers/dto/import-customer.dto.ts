import { ApiProperty } from '@nestjs/swagger';

export class ImportCustomerDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'File Excel (.xlsx, .csv)' })
  file: any;
}
