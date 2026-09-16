import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ingest } from '../domain/ingest';
import {
  chapterProgress,
  merge,
  uniqueSeconds,
  type ChapterProgressView,
  type Interval,
} from '../domain/progress';

export type PlaybackEventView = {
  accepted: boolean;
  rejectReason?: string;
  ranges: Interval[];
  cursor: number;
  chapterProgress: ChapterProgressView;
};

export type PlaybackCursorView = {
  videoId: string;
  positionSeconds: number;
};

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteDateOrNow(value: Date): Date {
  return Number.isFinite(value.getTime()) ? value : new Date();
}

@Injectable()
export class PlaybackService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestEvent(
    userId: string,
    body: {
      videoId?: string;
      from?: number;
      to?: number;
      rate?: number;
      at?: string | Date;
    },
  ): Promise<PlaybackEventView> {
    const videoId = typeof body.videoId === 'string' ? body.videoId : '';
    const from = Number(body.from);
    const to = Number(body.to);
    const rate = Number(body.rate);
    const at = body.at != null ? new Date(body.at) : new Date();

    const [users, videos] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true } }),
      this.prisma.video.findMany({ select: { id: true, durationSeconds: true } }),
    ]);

    const result = ingest(
      { userId, videoId, from, to, rate, at },
      {
        userIds: new Set(users.map((user) => user.id)),
        videoIds: new Set(videos.map((video) => video.id)),
      },
    );

    const accepted = result.accepted;
    const rejectReason = result.accepted ? null : result.reason;

    await this.prisma.playbackEvent.create({
      data: {
        userId,
        videoId,
        fromS: finiteOrZero(from),
        toS: finiteOrZero(to),
        rate: finiteOrZero(rate),
        at: finiteDateOrNow(at),
        accepted,
        rejectReason,
      },
    });

    if (accepted) {
      await this.prisma.playbackCursor.upsert({
        where: { userId_videoId: { userId, videoId } },
        update: { positionSeconds: to },
        create: { userId, videoId, positionSeconds: to },
      });
    }

    const acceptedEvents = await this.prisma.playbackEvent.findMany({
      where: { userId, videoId, accepted: true },
    });
    const ranges = merge(
      acceptedEvents.map((event) => ({ from: event.fromS, to: event.toS })),
    );

    const cursorRow = await this.prisma.playbackCursor.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    const video = videos.find((row) => row.id === videoId);
    const progress = chapterProgress(
      uniqueSeconds(ranges),
      video?.durationSeconds,
    );

    return {
      accepted,
      ...(rejectReason ? { rejectReason } : {}),
      ranges,
      cursor: cursorRow?.positionSeconds ?? 0,
      chapterProgress: progress,
    };
  }

  async upsertCursor(
    userId: string,
    body: { videoId?: string; positionSeconds?: number },
  ): Promise<PlaybackCursorView> {
    const positionSeconds = body.positionSeconds;
    if (
      typeof positionSeconds !== 'number' ||
      !Number.isFinite(positionSeconds) ||
      positionSeconds < 0
    ) {
      throw new HttpException(
        {
          code: 'INVALID_POSITION',
          message: 'positionSeconds must be a finite number >= 0',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const videoId = body.videoId;
    if (typeof videoId !== 'string' || videoId.length === 0) {
      throw new HttpException(
        { code: 'VIDEO_NOT_FOUND', message: 'Unknown video' },
        HttpStatus.NOT_FOUND,
      );
    }

    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      throw new HttpException(
        { code: 'VIDEO_NOT_FOUND', message: 'Unknown video' },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.playbackCursor.upsert({
      where: { userId_videoId: { userId, videoId } },
      update: { positionSeconds },
      create: { userId, videoId, positionSeconds },
    });

    return { videoId, positionSeconds };
  }
}
