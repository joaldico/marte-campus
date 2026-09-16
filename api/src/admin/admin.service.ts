import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type CourseRow = {
  id: string;
  title: string;
  status: string;
  publishedVersionId: string | null;
  workingVersionId: string | null;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourses(): Promise<
    { id: string; title: string; status: string; chapterCount: number }[]
  > {
    const courses = await this.prisma.course.findMany({
      orderBy: { title: 'asc' },
      include: {
        workingVersion: {
          include: { chapters: true },
        },
      },
    });
    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      status: course.status,
      chapterCount: course.workingVersion?.chapters.length ?? 0,
    }));
  }

  async createCourse(title: string): Promise<{
    id: string;
    title: string;
    status: string;
    workingVersionId: string | null;
    publishedVersionId: string | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: { title, status: 'draft' },
      });
      const version = await tx.courseVersion.create({
        data: {
          courseId: course.id,
          revisionStatus: 'draft',
          versionNumber: 1,
        },
      });
      return tx.course.update({
        where: { id: course.id },
        data: { workingVersionId: version.id },
      });
    });
  }

  async getCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        versions: true,
        workingVersion: {
          include: {
            chapters: {
              orderBy: { position: 'asc' },
              include: { video: true },
            },
          },
        },
      },
    });
    if (!course) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      id: course.id,
      title: course.title,
      status: course.status,
      workingVersionId: course.workingVersionId,
      publishedVersionId: course.publishedVersionId,
      versions: course.versions.map((version) => ({
        id: version.id,
        revisionStatus: version.revisionStatus,
        versionNumber: version.versionNumber,
      })),
      chapters: (course.workingVersion?.chapters ?? []).map((chapter) =>
        this.toChapterDto(chapter),
      ),
    };
  }

  async patchCourse(courseId: string, title: string) {
    await this.requireCourse(courseId);
    return this.prisma.course.update({
      where: { id: courseId },
      data: { title },
    });
  }

  async addChapter(courseId: string, title: string, url: string) {
    const course = await this.requireCourse(courseId);
    this.assertWorkingMutable(course);
    const video = await this.resolveVideo(url);
    const last = await this.prisma.chapter.findMany({
      where: { versionId: course.workingVersionId! },
      orderBy: { position: 'desc' },
    });
    const position = (last[0]?.position ?? 0) + 1;
    const chapter = await this.prisma.chapter.create({
      data: {
        versionId: course.workingVersionId!,
        videoId: video.id,
        title,
        position,
      },
      include: { video: true },
    });
    return this.toChapterDto(chapter);
  }

  async reorderChapters(courseId: string, chapterIds: string[]) {
    const course = await this.requireCourse(courseId);
    this.assertWorkingMutable(course);
    const working = await this.prisma.chapter.findMany({
      where: { versionId: course.workingVersionId! },
    });
    const workingIds = working.map((chapter) => chapter.id);
    if (!this.isExactIdSet(workingIds, chapterIds)) {
      throw new HttpException(
        {
          code: 'CHAPTER_SET_MISMATCH',
          message: 'chapterIds must be exactly the working-version chapters',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < chapterIds.length; i++) {
        await tx.chapter.update({
          where: { id: chapterIds[i] },
          data: { position: -(i + 1) },
        });
      }
      for (let i = 0; i < chapterIds.length; i++) {
        await tx.chapter.update({
          where: { id: chapterIds[i] },
          data: { position: i + 1 },
        });
      }
    });

    return this.getCourse(courseId);
  }

  async patchChapter(
    courseId: string,
    chapterId: string,
    title: string,
    url?: string,
  ) {
    const course = await this.requireCourse(courseId);
    this.assertWorkingMutable(course);
    await this.requireWorkingChapter(course, chapterId);
    const data: { title: string; videoId?: string } = { title };
    if (url) {
      const video = await this.resolveVideo(url);
      data.videoId = video.id;
    }
    const chapter = await this.prisma.chapter.update({
      where: { id: chapterId },
      data,
      include: { video: true },
    });
    return this.toChapterDto(chapter);
  }

  async deleteChapter(courseId: string, chapterId: string): Promise<void> {
    const course = await this.requireCourse(courseId);
    this.assertWorkingMutable(course);
    await this.requireWorkingChapter(course, chapterId);
    await this.prisma.chapter.delete({ where: { id: chapterId } });
    const remaining = await this.prisma.chapter.findMany({
      where: { versionId: course.workingVersionId! },
      orderBy: { position: 'asc' },
    });
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < remaining.length; i++) {
        await tx.chapter.update({
          where: { id: remaining[i].id },
          data: { position: -(i + 1) },
        });
      }
      for (let i = 0; i < remaining.length; i++) {
        await tx.chapter.update({
          where: { id: remaining[i].id },
          data: { position: i + 1 },
        });
      }
    });
  }

  private async requireCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    return course;
  }

  private assertWorkingMutable(course: CourseRow): void {
    if (!course.workingVersionId) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      course.publishedVersionId &&
      course.workingVersionId === course.publishedVersionId
    ) {
      throw new HttpException(
        {
          code: 'CHAPTER_ON_PUBLISHED',
          message: 'Cannot mutate chapters on a published working version',
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private async requireWorkingChapter(course: CourseRow, chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
    });
    if (!chapter) {
      throw new HttpException(
        { code: 'CHAPTER_NOT_FOUND', message: 'Unknown chapter' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (chapter.versionId === course.publishedVersionId) {
      throw new HttpException(
        {
          code: 'CHAPTER_ON_PUBLISHED',
          message: 'Cannot mutate chapters on a published version',
        },
        HttpStatus.CONFLICT,
      );
    }
    if (chapter.versionId !== course.workingVersionId) {
      throw new HttpException(
        { code: 'CHAPTER_NOT_FOUND', message: 'Unknown chapter' },
        HttpStatus.NOT_FOUND,
      );
    }
    return chapter;
  }

  private async resolveVideo(url: string) {
    const existing = await this.prisma.video.findFirst({ where: { url } });
    if (existing) {
      return existing;
    }
    return this.prisma.video.create({
      data: {
        id: await this.uniqueVideoId(url),
        url,
        durationSeconds: null,
      },
    });
  }

  private async uniqueVideoId(url: string): Promise<string> {
    const slug = slugFromUrl(url);
    if (slug) {
      const clash = await this.prisma.video.findUnique({ where: { id: slug } });
      if (!clash) {
        return slug;
      }
    }
    return randomUUID();
  }

  private isExactIdSet(actual: string[], incoming: string[]): boolean {
    if (!Array.isArray(incoming) || incoming.length !== actual.length) {
      return false;
    }
    if (new Set(incoming).size !== incoming.length) {
      return false;
    }
    const actualSet = new Set(actual);
    return incoming.every((id) => actualSet.has(id));
  }

  private toChapterDto(chapter: {
    id: string;
    title: string;
    videoId: string;
    position: number;
    video?: { url: string } | null;
  }) {
    return {
      id: chapter.id,
      title: chapter.title,
      videoId: chapter.videoId,
      url: chapter.video?.url ?? '',
      position: chapter.position,
    };
  }
}

function slugFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return last
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  } catch {
    return '';
  }
}
