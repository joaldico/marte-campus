import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogCourseProgressDto {
  @ApiProperty({ example: 0.636 })
  averageRatio!: number;

  @ApiProperty({ example: 2 })
  completedCount!: number;

  @ApiProperty({ example: 3 })
  totalCount!: number;
}

export class CatalogCourseDto {
  @ApiProperty({ example: 'paisajes-i' })
  id!: string;

  @ApiProperty({ example: 'Paisajes I' })
  title!: string;

  @ApiProperty({ example: true })
  enrolled!: boolean;

  @ApiPropertyOptional({ type: CatalogCourseProgressDto, nullable: true })
  progress!: CatalogCourseProgressDto | null;
}

export class EnrollResponseDto {
  @ApiProperty({ example: true })
  enrolled!: true;
}
