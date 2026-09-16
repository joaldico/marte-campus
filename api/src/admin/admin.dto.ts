import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseStatus, RevisionStatus } from '@prisma/client';

export class CreateAdminCourseDto {
  @ApiProperty({ example: 'Paisajes IV' })
  title!: string;
}

export class PatchAdminCourseDto {
  @ApiProperty({ example: 'Paisajes III — meta' })
  title!: string;
}

export class CreateAdminChapterDto {
  @ApiProperty({ example: 'Auroras' })
  title!: string;

  @ApiProperty({
    example:
      'https://archive.org/download/Flickr-10745021235/Northern_lights_timelapse-10745021235.mp4',
  })
  url!: string;
}

export class PatchAdminChapterDto {
  @ApiProperty({ example: 'Auroras' })
  title!: string;

  @ApiPropertyOptional({
    example:
      'https://archive.org/download/Flickr-10745021235/Northern_lights_timelapse-10745021235.mp4',
  })
  url?: string;
}

export class ReorderAdminChaptersDto {
  @ApiProperty({
    type: [String],
    example: ['chapter-b', 'chapter-a'],
  })
  chapterIds!: string[];
}

export class TransitionAdminCourseDto {
  @ApiProperty({ enum: CourseStatus, example: CourseStatus.in_review })
  to!: CourseStatus;
}

export class AdminCourseListItemDto {
  @ApiProperty({ example: 'paisajes-i' })
  id!: string;

  @ApiProperty({ example: 'Paisajes I' })
  title!: string;

  @ApiProperty({ enum: CourseStatus, example: CourseStatus.published })
  status!: CourseStatus;

  @ApiProperty({
    example: 3,
    description: 'Chapter count of the working version',
  })
  chapterCount!: number;
}

export class AdminCourseDto {
  @ApiProperty({ example: 'paisajes-iv' })
  id!: string;

  @ApiProperty({ example: 'Paisajes IV' })
  title!: string;

  @ApiProperty({ enum: CourseStatus, example: CourseStatus.draft })
  status!: CourseStatus;

  @ApiProperty({ example: 'uuid-working', nullable: true, type: String })
  workingVersionId!: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  publishedVersionId!: string | null;
}

export class AdminVersionSummaryDto {
  @ApiProperty({ example: 'paisajes-iv-v1' })
  id!: string;

  @ApiProperty({ enum: RevisionStatus, example: RevisionStatus.draft })
  revisionStatus!: RevisionStatus;

  @ApiProperty({ example: 1 })
  versionNumber!: number;
}

export class AdminChapterDto {
  @ApiProperty({ example: 'uuid-chapter' })
  id!: string;

  @ApiProperty({ example: 'Auroras' })
  title!: string;

  @ApiProperty({ example: 'auroras' })
  videoId!: string;

  @ApiProperty({
    example:
      'https://archive.org/download/Flickr-10745021235/Northern_lights_timelapse-10745021235.mp4',
  })
  url!: string;

  @ApiProperty({ example: 1 })
  position!: number;
}

export class AdminCourseDetailDto extends AdminCourseDto {
  @ApiProperty({ type: [AdminVersionSummaryDto] })
  versions!: AdminVersionSummaryDto[];

  @ApiProperty({
    type: [AdminChapterDto],
    description: 'Working-version chapters in position order',
  })
  chapters!: AdminChapterDto[];
}

export class ImportEventsFileDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'CSV 3.1: userId,videoId,from,to,rate[,at]',
  })
  file!: string;
}

export class ImportRejectCountDto {
  @ApiProperty({ example: 'inverted_interval' })
  reason!: string;

  @ApiProperty({ example: 1 })
  count!: number;
}

export class ImportEventsResponseDto {
  @ApiProperty({ example: 11 })
  accepted!: number;

  @ApiProperty({ type: [ImportRejectCountDto] })
  rejected!: ImportRejectCountDto[];
}

export class HeatmapBucketDto {
  @ApiProperty({ example: 7 })
  t!: number;

  @ApiProperty({ example: 0 })
  watchedWeight!: number;

  @ApiProperty({ example: 1 })
  skipWeight!: number;
}

export class VideoHeatmapDto {
  @ApiProperty({ example: 11 })
  durationSeconds!: number;

  @ApiProperty({ type: [HeatmapBucketDto] })
  buckets!: HeatmapBucketDto[];
}
