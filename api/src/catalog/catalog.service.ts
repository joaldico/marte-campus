import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  chapterProgress,
  courseProgress,
  merge,
  uniqueSeconds,
  type ChapterProgressView,
  type Interval,
} from '../domain/progress';

export type CatalogCourseProgress = {
  averageRatio: number;
  completedCount: number;
  totalCount: number;
};

export type CatalogCourseItem = {
  id: string;
  title: string;
  enrolled: boolean;
  progress: CatalogCourseProgress | null;
};

export type CatalogCourseDetailChapter = {
  id: string;
  videoId: string;
  title: string;
  position: number;
  ranges: Interval[];
  chapterProgress: ChapterProgressView;
};

export type CatalogCourseDetail = {
  id: string;
  title: string;
  chapters: CatalogCourseDetailChapter[];
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(userId: string): Promise<CatalogCourseItem[]> {
    const courses = await this.prisma.course.findMany({
      where: { status: 'published' },
      orderBy: { title: 'asc' },
      include: {
        publishedVersion: {
          include: {
            chapters: {
              orderBy: { position: 'asc' },
              include: { video: true },
            },
          },
        },
        enrollments: { where: { userId } },
      },
    });

    const enrolledVideoIds = [
      ...new Set(
        courses
          .filter((course) => course.enrollments.length > 0)
          .flatMap(
            (course) =>
              course.publishedVersion?.chapters.map((chapter) => chapter.videoId) ??
              [],
          ),
      ),
    ];

    const events =
      enrolledVideoIds.length === 0
        ? []
        : await this.prisma.playbackEvent.findMany({
            where: {
              userId,
              accepted: true,
              videoId: { in: enrolledVideoIds },
            },
          });

    return courses.map((course) => {
      const enrolled = course.enrollments.length > 0;
      if (!enrolled) {
        return {
          id: course.id,
          title: course.title,
          enrolled: false,
          progress: null,
        };
      }

      const chapterViews = (course.publishedVersion?.chapters ?? []).map(
        (chapter) => this.watchedFromEvents(events, chapter).chapterProgress,
      );

      return {
        id: course.id,
        title: course.title,
        enrolled: true,
        progress: courseProgress(chapterViews),
      };
    });
  }

  async enroll(userId: string, courseId: string): Promise<{ enrolled: true }> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (course.status === 'retired') {
      throw new HttpException(
        { code: 'COURSE_RETIRED', message: 'Course is retired' },
        HttpStatus.CONFLICT,
      );
    }
    if (course.status !== 'published') {
      throw new HttpException(
        { code: 'COURSE_NOT_PUBLISHED', message: 'Course is not published' },
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      throw new HttpException(
        { code: 'ALREADY_ENROLLED', message: 'Already enrolled' },
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.enrollment.create({ data: { userId, courseId } });
    return { enrolled: true };
  }

  async getPublishedById(
    userId: string,
    courseId: string,
  ): Promise<CatalogCourseDetail> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        publishedVersion: {
          include: {
            chapters: {
              orderBy: { position: 'asc' },
              include: { video: true },
            },
          },
        },
        enrollments: { where: { userId } },
      },
    });

    const publishedVersion = course?.publishedVersion;
    const enrolled = (course?.enrollments.length ?? 0) > 0;
    const lastPublishedReadable =
      !!publishedVersion &&
      (course.status === 'published' ||
        (course.status === 'retired' && enrolled));

    if (!course || !publishedVersion || !lastPublishedReadable) {
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

    const videoIds = publishedVersion.chapters.map((chapter) => chapter.videoId);
    const events =
      videoIds.length === 0
        ? []
        : await this.prisma.playbackEvent.findMany({
            where: {
              userId,
              accepted: true,
              videoId: { in: videoIds },
            },
          });

    return {
      id: course.id,
      title: course.title,
      chapters: publishedVersion.chapters.map((chapter) => {
        const watched = this.watchedFromEvents(events, chapter);
        return {
          id: chapter.id,
          videoId: chapter.videoId,
          title: chapter.title,
          position: chapter.position,
          ranges: watched.ranges,
          chapterProgress: watched.chapterProgress,
        };
      }),
    };
  }

  private watchedFromEvents(
    events: { videoId: string; fromS: number; toS: number }[],
    chapter: { videoId: string; video?: { durationSeconds: number | null } | null },
  ): { ranges: Interval[]; chapterProgress: ChapterProgressView } {
    const ranges = merge(
      events
        .filter((event) => event.videoId === chapter.videoId)
        .map((event) => ({ from: event.fromS, to: event.toS })),
    );
    return {
      ranges,
      chapterProgress: chapterProgress(
        uniqueSeconds(ranges),
        chapter.video?.durationSeconds,
      ),
    };
  }
}
