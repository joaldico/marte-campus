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

export class WatchedRangeDto {
  @ApiProperty({ example: 0 })
  from!: number;

  @ApiProperty({ example: 10 })
  to!: number;
}

export class CatalogChapterProgressDto {
  @ApiProperty({ example: 10 })
  uniqueSeconds!: number;

  @ApiProperty({ example: 10 })
  durationSeconds!: number;

  @ApiProperty({ example: 1 })
  ratio!: number;

  @ApiProperty({ example: true })
  completed!: boolean;
}

export class CatalogChapterDto {
  @ApiProperty({ example: 'paisajes-i-ch-1' })
  id!: string;

  @ApiProperty({ example: 'playa' })
  videoId!: string;

  @ApiProperty({ example: 'Playa' })
  title!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ type: [WatchedRangeDto] })
  ranges!: WatchedRangeDto[];

  @ApiProperty({ type: CatalogChapterProgressDto })
  chapterProgress!: CatalogChapterProgressDto;
}

export class CatalogCourseDetailDto {
  @ApiProperty({ example: 'paisajes-i' })
  id!: string;

  @ApiProperty({ example: 'Paisajes I' })
  title!: string;

  @ApiProperty({ type: [CatalogChapterDto] })
  chapters!: CatalogChapterDto[];
}
