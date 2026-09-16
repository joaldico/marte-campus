import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  chapterProgress,
  courseProgress,
  merge,
  uniqueSeconds,
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
        (chapter) => {
          const intervals = merge(
            events
              .filter((event) => event.videoId === chapter.videoId)
              .map((event) => ({ from: event.fromS, to: event.toS })),
          );
          return chapterProgress(
            uniqueSeconds(intervals),
            chapter.video?.durationSeconds,
          );
        },
      );

      return {
        id: course.id,
        title: course.title,
        enrolled: true,
        progress: courseProgress(chapterViews),
      };
    });
  }
}
