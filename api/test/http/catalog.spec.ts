import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  chapterProgress,
  courseProgress,
  merge,
  uniqueSeconds,
} from '../../src/domain/progress';
import {
  SEED_COURSES,
  SEED_ENROLLMENTS,
  SEED_USERS,
  VIDEO_DURATIONS,
  buildSeedPlaybackRecords,
} from '../../prisma/seed';

function cookieHeader(setCookie: string | string[] | undefined): string {
  const parts = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

function expectedPublishedProgress(userId: string) {
  const course = SEED_COURSES.find((row) => row.status === 'published');
  if (!course) {
    throw new Error('seed has no published course');
  }
  const events = buildSeedPlaybackRecords();
  const chapters = course.version.chapters.map((chapter) => {
    const intervals = merge(
      events
        .filter(
          (row) =>
            row.accepted &&
            row.userId === userId &&
            row.videoId === chapter.videoId,
        )
        .map((row) => ({ from: row.fromS, to: row.toS })),
    );
    const duration = VIDEO_DURATIONS.find((video) => video.id === chapter.videoId)
      ?.durationSeconds;
    return chapterProgress(uniqueSeconds(intervals), duration);
  });
  return courseProgress(chapters);
}

function seedPrisma() {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));
  const enrollments = SEED_ENROLLMENTS.map((row) => ({
    id: `enroll-${row.userId}-${row.courseId}`,
    userId: row.userId,
    courseId: row.courseId,
  }));
  const events = buildSeedPlaybackRecords();
  const courses = SEED_COURSES.map((course) => ({
    id: course.id,
    title: course.title,
    status: course.status,
    publishedVersionId: course.status === 'published' ? course.version.id : null,
    workingVersionId: course.version.id,
    publishedVersion:
      course.status === 'published'
        ? {
            id: course.version.id,
            revisionStatus: course.version.revisionStatus,
            versionNumber: course.version.versionNumber,
            chapters: course.version.chapters.map((chapter) => ({
              ...chapter,
              video: VIDEO_DURATIONS.find((video) => video.id === chapter.videoId) ?? null,
            })),
          }
        : {
            id: course.version.id,
            revisionStatus: course.version.revisionStatus,
            versionNumber: course.version.versionNumber,
            chapters: course.version.chapters.map((chapter) => ({
              ...chapter,
              video: VIDEO_DURATIONS.find((video) => video.id === chapter.videoId) ?? null,
            })),
          },
  }));

  const matchVideoId = (rowVideoId: string, filter: unknown): boolean => {
    if (filter == null) {
      return true;
    }
    if (typeof filter === 'string') {
      return rowVideoId === filter;
    }
    if (typeof filter === 'object' && filter !== null && 'in' in filter) {
      const ids = (filter as { in: string[] }).in;
      return ids.includes(rowVideoId);
    }
    return true;
  };

  return {
    user: {
      findMany: jest.fn(async () => users),
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        return users.find((user) => user.id === id) ?? null;
      }),
    },
    session: {
      create: jest.fn(async ({ data }: { data: { userId: string; expiresAt: Date } }) => {
        const id = `sess-${data.userId}`;
        const user = users.find((row) => row.id === data.userId);
        sessions.set(id, { userId: data.userId, expiresAt: data.expiresAt });
        return { id, userId: data.userId, expiresAt: data.expiresAt, user };
      }),
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const session = sessions.get(id);
        if (!session) {
          return null;
        }
        const user = users.find((row) => row.id === session.userId);
        return { id, userId: session.userId, expiresAt: session.expiresAt, user };
      }),
      delete: jest.fn(),
    },
    course: {
      findMany: jest.fn(async (args: { where?: { status?: string }; include?: { enrollments?: { where?: { userId?: string } } } } = {}) => {
        let rows = courses.map((course) => ({
          ...course,
          enrollments: enrollments.filter((row) => row.courseId === course.id),
        }));
        if (args.where?.status) {
          rows = rows.filter((course) => course.status === args.where?.status);
        }
        const enrollmentUserId = args.include?.enrollments?.where?.userId;
        if (enrollmentUserId) {
          rows = rows.map((course) => ({
            ...course,
            enrollments: course.enrollments.filter((row) => row.userId === enrollmentUserId),
          }));
        }
        return rows;
      }),
    },
    enrollment: {
      findMany: jest.fn(async (args: { where?: { userId?: string; courseId?: string } } = {}) => {
        return enrollments.filter((row) => {
          if (args.where?.userId && row.userId !== args.where.userId) {
            return false;
          }
          if (args.where?.courseId && row.courseId !== args.where.courseId) {
            return false;
          }
          return true;
        });
      }),
    },
    playbackEvent: {
      findMany: jest.fn(async (args: { where?: { userId?: string; accepted?: boolean; videoId?: unknown } } = {}) => {
        return events.filter((row) => {
          if (args.where?.userId && row.userId !== args.where.userId) {
            return false;
          }
          if (args.where?.accepted !== undefined && row.accepted !== args.where.accepted) {
            return false;
          }
          return matchVideoId(row.videoId, args.where?.videoId);
        });
      }),
    },
  };
}

describe('GET /catalog/courses', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(seedPrisma())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function loginAs(userId: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId });
    expect(login.status).toBe(200);
    return cookieHeader(login.headers['set-cookie']);
  }

  it('returns 401 without a session cookie', async () => {
    const response = await request(app.getHttpServer()).get('/catalog/courses');
    expect(response.status).toBe(401);
  });

  it('lists only published courses: Paisajes I, never II or III', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const titles = response.body.map((row: { title: string }) => row.title);
    expect(titles).toEqual(['Paisajes I']);
    expect(titles).not.toContain('Paisajes II');
    expect(titles).not.toContain('Paisajes III');
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: 'paisajes-i',
        title: 'Paisajes I',
      }),
    );
  });

  it('Diego is not enrolled and has no progress object', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const course = response.body[0];
    expect(course.enrolled).toBe(false);
    expect(course.progress).toBeFalsy();
  });

  it('Bruno is enrolled with ProgressEngine courseProgress over published-version chapters', async () => {
    const expected = expectedPublishedProgress('bruno');
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const course = response.body[0];
    expect(course.enrolled).toBe(true);
    expect(course.progress.averageRatio).toBeCloseTo(expected.averageRatio);
    expect(course.progress.completedCount).toBe(expected.completedCount);
    expect(course.progress.totalCount).toBe(expected.totalCount);
  });

  it('Carla is enrolled with ProgressEngine ratios from accepted events only', async () => {
    const expected = expectedPublishedProgress('carla');
    const cookie = await loginAs('carla');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const course = response.body[0];
    expect(course.enrolled).toBe(true);
    expect(course.progress.averageRatio).toBeCloseTo(expected.averageRatio);
    expect(course.progress.completedCount).toBe(expected.completedCount);
    expect(course.progress.totalCount).toBe(expected.totalCount);
  });
});
