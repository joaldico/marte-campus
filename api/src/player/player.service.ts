import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { merge, type Interval } from '../domain/progress';
import { playerVideoUrl } from '../videos/video-proxy';

export type PlayerPlaylistItem = {
  id: string;
  title: string;
  position: number;
};

export type PlayerChapterView = {
  id: string;
  videoId: string;
  title: string;
  position: number;
  url: string;
  ranges: Interval[];
  cursor: number;
  courseId: string;
  courseTitle: string;
  playlist: PlayerPlaylistItem[];
  siblings: { previousId: string | null; nextId: string | null };
};

@Injectable()
export class PlayerService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublishedChapter(
    userId: string,
    chapterId: string,
  ): Promise<PlayerChapterView> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        video: true,
        version: {
          include: {
            course: {
              include: {
                enrollments: { where: { userId } },
                publishedVersion: {
                  include: {
                    chapters: { orderBy: { position: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const course = chapter?.version.course;
    const publishedVersion = course?.publishedVersion;
    const enrolled = (course?.enrollments.length ?? 0) > 0;
    const onPublishedVersion =
      !!chapter &&
      !!course &&
      !!publishedVersion &&
      publishedVersion.chapters.some((row) => row.id === chapter.id);
    const lastPublishedReadable =
      onPublishedVersion &&
      (course?.status === 'published' ||
        (course?.status === 'retired' && enrolled));

    if (!lastPublishedReadable || !chapter || !course || !publishedVersion) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!enrolled) {
      throw new HttpException(
        { code: 'NOT_ENROLLED', message: 'Not enrolled in this course' },
        HttpStatus.FORBIDDEN,
      );
    }

    const events = await this.prisma.playbackEvent.findMany({
      where: {
        userId,
        accepted: true,
        videoId: chapter.videoId,
      },
    });
    const ranges = merge(
      events.map((event) => ({ from: event.fromS, to: event.toS })),
    );

    const cursorRow = await this.prisma.playbackCursor.findUnique({
      where: {
        userId_videoId: { userId, videoId: chapter.videoId },
      },
    });

    const ordered = publishedVersion.chapters;
    const index = ordered.findIndex((row) => row.id === chapter.id);

    return {
      id: chapter.id,
      videoId: chapter.videoId,
      title: chapter.title,
      position: chapter.position,
      url: playerVideoUrl(chapter.videoId, chapter.video.url),
      ranges,
      cursor: cursorRow?.positionSeconds ?? 0,
      courseId: course.id,
      courseTitle: course.title,
      playlist: ordered.map((row) => ({
        id: row.id,
        title: row.title,
        position: row.position,
      })),
      siblings: {
        previousId: index > 0 ? ordered[index - 1].id : null,
        nextId:
          index >= 0 && index < ordered.length - 1
            ? ordered[index + 1].id
            : null,
      },
    };
  }
}
