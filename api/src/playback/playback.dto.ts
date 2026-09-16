import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlaybackEventBodyDto {
  @ApiProperty({ example: 'playa' })
  videoId!: string;

  @ApiProperty({ example: 10 })
  from!: number;

  @ApiProperty({ example: 12 })
  to!: number;

  @ApiProperty({ example: 1 })
  rate!: number;

  @ApiPropertyOptional({
    example: '2026-09-16T12:00:00.000Z',
    description: 'ISO timestamp; defaults to now',
  })
  at?: string;
}

export class PlaybackWatchedRangeDto {
  @ApiProperty({ example: 0 })
  from!: number;

  @ApiProperty({ example: 12 })
  to!: number;
}

export class PlaybackChapterProgressDto {
  @ApiProperty({ example: 12 })
  uniqueSeconds!: number;

  @ApiProperty({ example: 10 })
  durationSeconds!: number;

  @ApiProperty({ example: 1 })
  ratio!: number;

  @ApiProperty({ example: true })
  completed!: boolean;
}

export class PlaybackEventResponseDto {
  @ApiProperty({ example: true })
  accepted!: boolean;

  @ApiPropertyOptional({ example: 'inverted_interval' })
  rejectReason?: string;

  @ApiProperty({ type: [PlaybackWatchedRangeDto] })
  ranges!: PlaybackWatchedRangeDto[];

  @ApiProperty({ example: 12 })
  cursor!: number;

  @ApiProperty({ type: PlaybackChapterProgressDto })
  chapterProgress!: PlaybackChapterProgressDto;
}

export class PlaybackCursorBodyDto {
  @ApiProperty({ example: 'playa' })
  videoId!: string;

  @ApiProperty({ example: 6 })
  positionSeconds!: number;
}

export class PlaybackCursorResponseDto {
  @ApiProperty({ example: 'playa' })
  videoId!: string;

  @ApiProperty({ example: 6 })
  positionSeconds!: number;
}
