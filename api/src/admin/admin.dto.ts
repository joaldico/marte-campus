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
