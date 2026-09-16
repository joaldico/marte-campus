import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ enum: ['ok', 'unavailable'], example: 'ok' })
  db!: 'ok' | 'unavailable';
}
