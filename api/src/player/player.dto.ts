import { ApiProperty } from '@nestjs/swagger';

export class PlayerWatchedRangeDto {
  @ApiProperty({ example: 0 })
  from!: number;

  @ApiProperty({ example: 10 })
  to!: number;
}

export class PlayerPlaylistItemDto {
  @ApiProperty({ example: 'paisajes-i-ch-1' })
  id!: string;

  @ApiProperty({ example: 'Playa' })
  title!: string;

  @ApiProperty({ example: 1 })
  position!: number;
}

export class PlayerSiblingsDto {
  @ApiProperty({ example: null, nullable: true, type: String })
  previousId!: string | null;

  @ApiProperty({ example: 'paisajes-i-ch-2', nullable: true, type: String })
  nextId!: string | null;
}

export class PlayerChapterDto {
  @ApiProperty({ example: 'paisajes-i-ch-1' })
  id!: string;

  @ApiProperty({ example: 'playa' })
  videoId!: string;

  @ApiProperty({ example: 'Playa' })
  title!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({
    example: '/videos/playa/stream',
    description:
      '/videos/{videoId}/stream when VIDEO_PROXY=true; otherwise the Video.origin URL',
  })
  url!: string;

  @ApiProperty({ type: [PlayerWatchedRangeDto] })
  ranges!: PlayerWatchedRangeDto[];

  @ApiProperty({
    example: 0,
    description: 'PlaybackCursor.positionSeconds for (user, videoId), or 0',
  })
  cursor!: number;

  @ApiProperty({ example: 'paisajes-i' })
  courseId!: string;

  @ApiProperty({ example: 'Paisajes I' })
  courseTitle!: string;

  @ApiProperty({ type: [PlayerPlaylistItemDto] })
  playlist!: PlayerPlaylistItemDto[];

  @ApiProperty({ type: PlayerSiblingsDto })
  siblings!: PlayerSiblingsDto;
}
