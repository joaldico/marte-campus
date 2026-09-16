import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CourseStatus as PrismaCourseStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { build as buildHeatmap } from '../domain/heatmap';
import { ingest, type RejectReason } from '../domain/ingest';
import {
  assertCanTransition,
  StateMachineError,
  type CourseStatus,
  type StateMachineErrorCode,
} from '../domain/state-machine';
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

  async transitionCourse(courseId: string, to: PrismaCourseStatus) {
    const course = await this.requireCourse(courseId);
    const workingChapters = course.workingVersionId
      ? await this.prisma.chapter.findMany({
          where: { versionId: course.workingVersionId },
        })
      : [];

    try {
      assertCanTransition(
        course.status as CourseStatus,
        to as CourseStatus,
        workingChapters.length,
      );
    } catch (err) {
      if (err instanceof StateMachineError) {
        throw new HttpException(
          { code: err.code, message: stateMachineMessage(err.code) },
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    return this.prisma.$transaction(async (tx) => {
      if (to === 'in_review' || to === 'published') {
        if (!course.workingVersionId) {
          throw new HttpException(
            { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
            HttpStatus.NOT_FOUND,
          );
        }
        await tx.courseVersion.update({
          where: { id: course.workingVersionId },
          data: { revisionStatus: to },
        });
      }

      const data: {
        status: PrismaCourseStatus;
        publishedVersionId?: string | null;
      } = { status: to };
      if (to === 'published') {
        data.publishedVersionId = course.workingVersionId;
      }

      return tx.course.update({
        where: { id: courseId },
        data,
      });
    });
  }

  async addChapter(courseId: string, title: string, url: string) {
    const course = await this.requireCourse(courseId);
    this.assertWorkingMutable(course);
    const video = await this.resolveVideo(url);
    if (this.needsPublishedClone(course)) {
      return this.prisma.$transaction(async (tx) => {
        const { course: cloned } = await this.clonePublishedWorking(tx, course);
        return this.appendChapter(tx, cloned.workingVersionId!, title, video.id);
      });
    }
    return this.appendChapter(this.prisma, course.workingVersionId!, title, video.id);
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

    if (this.needsPublishedClone(course)) {
      await this.prisma.$transaction(async (tx) => {
        const { chapterIdMap } = await this.clonePublishedWorking(tx, course);
        const remappedIds = chapterIds.map((id) => chapterIdMap.get(id) ?? id);
        await this.writeChapterOrder(tx, remappedIds);
      });
      return this.getCourse(courseId);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.writeChapterOrder(tx, chapterIds);
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
    await this.assertChapterReadyForMutation(course, chapterId);
    const data: { title: string; videoId?: string } = { title };
    if (url) {
      const video = await this.resolveVideo(url);
      data.videoId = video.id;
    }

    if (this.needsPublishedClone(course)) {
      return this.prisma.$transaction(async (tx) => {
        const { chapterIdMap } = await this.clonePublishedWorking(tx, course);
        const targetId = chapterIdMap.get(chapterId) ?? chapterId;
        const chapter = await tx.chapter.update({
          where: { id: targetId },
          data,
          include: { video: true },
        });
        return this.toChapterDto(chapter);
      });
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
    await this.assertChapterReadyForMutation(course, chapterId);

    if (this.needsPublishedClone(course)) {
      await this.prisma.$transaction(async (tx) => {
        const { course: cloned, chapterIdMap } = await this.clonePublishedWorking(
          tx,
          course,
        );
        const targetId = chapterIdMap.get(chapterId) ?? chapterId;
        await tx.chapter.delete({ where: { id: targetId } });
        await this.renumberWorkingChapters(tx, cloned.workingVersionId!);
      });
      return;
    }

    await this.prisma.chapter.delete({ where: { id: chapterId } });
    await this.prisma.$transaction(async (tx) => {
      await this.renumberWorkingChapters(tx, course.workingVersionId!);
    });
  }

  async submitRevision(courseId: string) {
    const course = await this.requireCourse(courseId);
    const working = await this.requireWorkingVersion(course);
    if (
      course.workingVersionId === course.publishedVersionId ||
      working.revisionStatus !== 'draft'
    ) {
      throw new HttpException(
        {
          code: 'STATE_TRANSITION_FORBIDDEN',
          message: stateMachineMessage('STATE_TRANSITION_FORBIDDEN'),
        },
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.courseVersion.update({
      where: { id: working.id },
      data: { revisionStatus: 'in_review' },
    });
    return this.prisma.course.findUnique({ where: { id: courseId } });
  }

  async getVideoHeatmap(videoId: string): Promise<{
    durationSeconds: number;
    buckets: { t: number; watchedWeight: number; skipWeight: number }[];
  }> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      throw new HttpException(
        { code: 'VIDEO_NOT_FOUND', message: 'Unknown video' },
        HttpStatus.NOT_FOUND,
      );
    }

    const events = await this.prisma.playbackEvent.findMany({
      where: { videoId, accepted: true },
    });
    const durationSeconds = video.durationSeconds ?? 0;
    return {
      durationSeconds,
      buckets: buildHeatmap(
        events.map((event) => ({ from: event.fromS, to: event.toS })),
        durationSeconds,
        1,
      ),
    };
  }

  async importEvents(csv: string): Promise<{
    accepted: number;
    rejected: { reason: RejectReason; count: number }[];
  }> {
    const rows = parsePlaybackCsv(csv);
    const [users, videos] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true } }),
      this.prisma.video.findMany({ select: { id: true } }),
    ]);
    const ctx = {
      userIds: new Set(users.map((user) => user.id)),
      videoIds: new Set(videos.map((video) => video.id)),
    };

    let accepted = 0;
    const rejectedCounts = new Map<RejectReason, number>();

    for (const row of rows) {
      const result = ingest(
        {
          userId: row.userId,
          videoId: row.videoId,
          from: row.from,
          to: row.to,
          rate: row.rate,
          at: row.at,
        },
        ctx,
      );
      if (result.accepted) {
        accepted += 1;
      } else {
        rejectedCounts.set(
          result.reason,
          (rejectedCounts.get(result.reason) ?? 0) + 1,
        );
      }

      await this.prisma.playbackEvent.create({
        data: {
          userId: row.userId,
          videoId: row.videoId,
          fromS: finiteOrZero(row.from),
          toS: finiteOrZero(row.to),
          rate: finiteOrZero(row.rate),
          at: finiteDateOrNow(row.at),
          accepted: result.accepted,
          rejectReason: result.accepted ? null : result.reason,
        },
      });
    }

    return {
      accepted,
      rejected: [...rejectedCounts.entries()].map(([reason, count]) => ({
        reason,
        count,
      })),
    };
  }

  async publishRevision(courseId: string) {
    const course = await this.requireCourse(courseId);
    const working = await this.requireWorkingVersion(course);
    if (working.revisionStatus !== 'in_review') {
      throw new HttpException(
        {
          code: 'STATE_TRANSITION_FORBIDDEN',
          message: stateMachineMessage('STATE_TRANSITION_FORBIDDEN'),
        },
        HttpStatus.CONFLICT,
      );
    }

    const chapters = await this.prisma.chapter.findMany({
      where: { versionId: working.id },
    });
    if (chapters.length < 1) {
      throw new HttpException(
        {
          code: 'COURSE_EMPTY',
          message: stateMachineMessage('COURSE_EMPTY'),
        },
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.courseVersion.update({
        where: { id: working.id },
        data: { revisionStatus: 'published' },
      });
      return tx.course.update({
        where: { id: courseId },
        data: { publishedVersionId: working.id },
      });
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

  private needsPublishedClone(course: CourseRow): boolean {
    return (
      course.status === 'published' &&
      !!course.workingVersionId &&
      !!course.publishedVersionId &&
      course.workingVersionId === course.publishedVersionId
    );
  }

  private async assertChapterReadyForMutation(
    course: CourseRow,
    chapterId: string,
  ): Promise<void> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
    });
    if (!chapter) {
      throw new HttpException(
        { code: 'CHAPTER_NOT_FOUND', message: 'Unknown chapter' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (this.needsPublishedClone(course)) {
      if (chapter.versionId !== course.workingVersionId) {
        throw new HttpException(
          { code: 'CHAPTER_NOT_FOUND', message: 'Unknown chapter' },
          HttpStatus.NOT_FOUND,
        );
      }
      return;
    }
    await this.requireWorkingChapter(course, chapterId);
  }

  private async clonePublishedWorking(
    tx: Prisma.TransactionClient,
    course: CourseRow,
  ): Promise<{ course: CourseRow; chapterIdMap: Map<string, string> }> {
    const source = await tx.courseVersion.findUnique({
      where: { id: course.publishedVersionId! },
    });
    if (!source) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }

    const sourceChapters = await tx.chapter.findMany({
      where: { versionId: course.publishedVersionId! },
      orderBy: { position: 'asc' },
    });

    const clone = await tx.courseVersion.create({
      data: {
        courseId: course.id,
        revisionStatus: 'draft',
        versionNumber: source.versionNumber + 1,
      },
    });
    const chapterIdMap = new Map<string, string>();
    for (const chapter of sourceChapters) {
      const copied = await tx.chapter.create({
        data: {
          versionId: clone.id,
          videoId: chapter.videoId,
          title: chapter.title,
          position: chapter.position,
        },
      });
      chapterIdMap.set(chapter.id, copied.id);
    }
    const updated = await tx.course.update({
      where: { id: course.id },
      data: { workingVersionId: clone.id },
    });
    return { course: updated as CourseRow, chapterIdMap };
  }

  private async appendChapter(
    db: Prisma.TransactionClient | PrismaService,
    versionId: string,
    title: string,
    videoId: string,
  ) {
    const last = await db.chapter.findMany({
      where: { versionId },
      orderBy: { position: 'desc' },
    });
    const position = (last[0]?.position ?? 0) + 1;
    const chapter = await db.chapter.create({
      data: {
        versionId,
        videoId,
        title,
        position,
      },
      include: { video: true },
    });
    return this.toChapterDto(chapter);
  }

  private async writeChapterOrder(
    db: Prisma.TransactionClient | PrismaService,
    chapterIds: string[],
  ): Promise<void> {
    for (let i = 0; i < chapterIds.length; i++) {
      await db.chapter.update({
        where: { id: chapterIds[i] },
        data: { position: -(i + 1) },
      });
    }
    for (let i = 0; i < chapterIds.length; i++) {
      await db.chapter.update({
        where: { id: chapterIds[i] },
        data: { position: i + 1 },
      });
    }
  }

  private async renumberWorkingChapters(
    db: Prisma.TransactionClient | PrismaService,
    versionId: string,
  ): Promise<void> {
    const remaining = await db.chapter.findMany({
      where: { versionId },
      orderBy: { position: 'asc' },
    });
    await this.writeChapterOrder(
      db,
      remaining.map((chapter) => chapter.id),
    );
  }

  private async requireWorkingVersion(course: CourseRow) {
    if (!course.workingVersionId) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    const version = await this.prisma.courseVersion.findUnique({
      where: { id: course.workingVersionId },
    });
    if (!version) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    return version;
  }

  private assertWorkingMutable(course: CourseRow): void {
    if (!course.workingVersionId) {
      throw new HttpException(
        { code: 'COURSE_NOT_FOUND', message: 'Unknown course' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      course.status !== 'published' &&
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

function stateMachineMessage(code: StateMachineErrorCode): string {
  if (code === 'COURSE_EMPTY') {
    return 'Working version has no chapters';
  }
  return 'Illegal course status transition';
}

type CsvPlaybackRow = {
  userId: string;
  videoId: string;
  from: number;
  to: number;
  rate: number;
  at: Date;
};

function parsePlaybackCsv(text: string): CsvPlaybackRow[] {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].split(',').map((cell) => cell.trim());
  const idx = {
    userId: header.indexOf('userId'),
    videoId: header.indexOf('videoId'),
    from: header.indexOf('from'),
    to: header.indexOf('to'),
    rate: header.indexOf('rate'),
    at: header.indexOf('at'),
  };

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((cell) => cell.trim());
    const atRaw = idx.at >= 0 ? cols[idx.at] : undefined;
    return {
      userId: cols[idx.userId] ?? '',
      videoId: cols[idx.videoId] ?? '',
      from: Number(cols[idx.from]),
      to: Number(cols[idx.to]),
      rate: Number(cols[idx.rate]),
      at: atRaw ? new Date(atRaw) : new Date(),
    };
  });
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteDateOrNow(value: Date): Date {
  return Number.isFinite(value.getTime()) ? value : new Date();
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
