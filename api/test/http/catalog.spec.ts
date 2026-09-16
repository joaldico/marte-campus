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

function expectedPublishedChapters(userId: string) {
  const course = SEED_COURSES.find((row) => row.status === 'published');
  if (!course) {
    throw new Error('seed has no published course');
  }
  const events = buildSeedPlaybackRecords();
  return course.version.chapters.map((chapter) => {
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
    const progress = chapterProgress(uniqueSeconds(intervals), duration);
    return {
      id: chapter.id,
      videoId: chapter.videoId,
      title: chapter.title,
      position: chapter.position,
      ranges: intervals,
      chapterProgress: {
        ratio: progress.ratio,
        completed: progress.completed,
      },
    };
  });
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

function seedPrisma(options: { retirePaisajesI?: boolean } = {}) {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));
  const enrollments = SEED_ENROLLMENTS.map((row) => ({
    id: `enroll-${row.userId}-${row.courseId}`,
    userId: row.userId,
    courseId: row.courseId,
  }));
  const events = buildSeedPlaybackRecords();
  const versionPayload = (course: (typeof SEED_COURSES)[number]) => ({
    id: course.version.id,
    revisionStatus: course.version.revisionStatus,
    versionNumber: course.version.versionNumber,
    chapters: course.version.chapters.map((chapter) => ({
      ...chapter,
      video: VIDEO_DURATIONS.find((video) => video.id === chapter.videoId) ?? null,
    })),
  });

  const courses = [
    ...SEED_COURSES.map((course) => {
      const retiredI = options.retirePaisajesI === true && course.id === 'paisajes-i';
      const keepPublishedSnapshot = course.status === 'published' || retiredI;
      return {
        id: course.id,
        title: course.title,
        status: retiredI ? 'retired' : course.status,
        publishedVersionId: keepPublishedSnapshot ? course.version.id : null,
        workingVersionId: course.version.id,
        publishedVersion: keepPublishedSnapshot ? versionPayload(course) : null,
      };
    }),
    {
      id: 'paisajes-retired',
      title: 'Paisajes Retired',
      status: 'retired',
      publishedVersionId: null,
      workingVersionId: 'paisajes-retired-v1',
      publishedVersion: null,
    },
  ];

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
      findUnique: jest.fn(
        async (args: {
          where: { id: string };
          include?: {
            publishedVersion?: unknown;
            enrollments?: { where?: { userId?: string } };
          };
        }) => {
          const course = courses.find((row) => row.id === args.where.id);
          if (!course) {
            return null;
          }
          const enrollmentUserId = args.include?.enrollments?.where?.userId;
          const courseEnrollments = enrollments.filter((row) => {
            if (row.courseId !== course.id) {
              return false;
            }
            if (enrollmentUserId && row.userId !== enrollmentUserId) {
              return false;
            }
            return true;
          });
          const publishedVersion = course.publishedVersion
            ? {
                ...course.publishedVersion,
                chapters: [...course.publishedVersion.chapters].sort(
                  (a, b) => a.position - b.position,
                ),
              }
            : null;
          return {
            ...course,
            publishedVersion: args.include?.publishedVersion
              ? publishedVersion
              : course.publishedVersion,
            enrollments: args.include?.enrollments ? courseEnrollments : undefined,
          };
        },
      ),
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
      findUnique: jest.fn(
        async ({
          where: { userId_courseId },
        }: {
          where: { userId_courseId?: { userId: string; courseId: string } };
        }) => {
          if (!userId_courseId) {
            return null;
          }
          return (
            enrollments.find(
              (row) =>
                row.userId === userId_courseId.userId &&
                row.courseId === userId_courseId.courseId,
            ) ?? null
          );
        },
      ),
      create: jest.fn(async ({ data }: { data: { userId: string; courseId: string } }) => {
        const row = {
          id: `enroll-${data.userId}-${data.courseId}`,
          userId: data.userId,
          courseId: data.courseId,
        };
        enrollments.push(row);
        return row;
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

describe('POST /catalog/courses/:id/enroll', () => {
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
    const response = await request(app.getHttpServer()).post(
      '/catalog/courses/paisajes-i/enroll',
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when the course id is unknown', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/does-not-exist/enroll')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
  });

  it('returns 409 COURSE_RETIRED when the course is retired', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-retired/enroll')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COURSE_RETIRED');
  });

  it('returns 409 COURSE_NOT_PUBLISHED for draft Paisajes III', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-iii/enroll')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COURSE_NOT_PUBLISHED');
  });

  it('returns 409 COURSE_NOT_PUBLISHED for in_review Paisajes II', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-ii/enroll')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COURSE_NOT_PUBLISHED');
  });

  it('returns 409 ALREADY_ENROLLED when Bruno is already in Paisajes I', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-i/enroll')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_ENROLLED');
  });

  it('lets Ana enroll in published Paisajes I', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-i/enroll')
      .set('Cookie', cookie);

    expect([200, 201]).toContain(response.status);
  });

  it('Diego enrolls in Paisajes I and catalog progress includes seed playa uniqueSeconds', async () => {
    const expected = expectedPublishedProgress('diego');
    const cookie = await loginAs('diego');

    const enroll = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-i/enroll')
      .set('Cookie', cookie);
    expect([200, 201]).toContain(enroll.status);

    const catalog = await request(app.getHttpServer())
      .get('/catalog/courses')
      .set('Cookie', cookie);
    expect(catalog.status).toBe(200);
    const course = catalog.body[0];
    expect(course.enrolled).toBe(true);
    expect(course.progress.completedCount).toBe(expected.completedCount);
    expect(course.progress.totalCount).toBe(expected.totalCount);
    expect(course.progress.averageRatio).toBeCloseTo(expected.averageRatio);
  });
});

describe('GET /catalog/courses/:id', () => {
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
    const response = await request(app.getHttpServer()).get(
      '/catalog/courses/paisajes-i',
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when the course id is unknown', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/does-not-exist')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('returns 404 for unpublished Paisajes II so students cannot leak it', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-ii')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('returns 404 for unpublished Paisajes III so students cannot leak it', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-iii')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('returns 403 NOT_ENROLLED when Diego is not enrolled in published Paisajes I', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('NOT_ENROLLED');
  });

  it('Bruno sees Paisajes I published chapters in order with merge ranges and chapterProgress', async () => {
    const expected = expectedPublishedChapters('bruno');
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('paisajes-i');
    expect(response.body.title).toBe('Paisajes I');
    const videoIds = response.body.chapters.map(
      (chapter: { videoId: string }) => chapter.videoId,
    );
    expect(videoIds).toEqual(['playa', 'cascada', 'bosque']);
    expect(videoIds).not.toContain('atardecer');
    expect(response.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Playa',
      'Cascada',
      'Bosque',
    ]);
    expect(
      response.body.chapters.map((chapter: { position: number }) => chapter.position),
    ).toEqual([1, 2, 3]);

    for (let i = 0; i < expected.length; i++) {
      const chapter = response.body.chapters[i];
      expect(chapter.id).toBe(expected[i].id);
      expect(chapter.videoId).toBe(expected[i].videoId);
      expect(chapter.ranges).toEqual(expected[i].ranges);
      expect(chapter.chapterProgress.ratio).toBeCloseTo(expected[i].chapterProgress.ratio);
      expect(chapter.chapterProgress.completed).toBe(expected[i].chapterProgress.completed);
    }
  });
});

describe('retired Paisajes I (spec 2.6 last published read)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(seedPrisma({ retirePaisajesI: true }))
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

  it('Diego enroll Paisajes I after Ana retires → 409 COURSE_RETIRED', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .post('/catalog/courses/paisajes-i/enroll')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COURSE_RETIRED');
  });

  it('omits Paisajes I from GET /catalog/courses after retire (published-only list)', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const titles = response.body.map((row: { title: string }) => row.title);
    expect(titles).not.toContain('Paisajes I');
    expect(titles).not.toContain('Paisajes II');
    expect(titles).not.toContain('Paisajes III');
  });

  it('Bruno GET /catalog/courses/paisajes-i after retire is 200 last published, not COURSE_NOT_FOUND', async () => {
    const expected = expectedPublishedChapters('bruno');
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.code).not.toBe('COURSE_NOT_FOUND');
    expect(response.body.id).toBe('paisajes-i');
    expect(response.body.title).toBe('Paisajes I');
    expect(
      response.body.chapters.map((chapter: { videoId: string }) => chapter.videoId),
    ).toEqual(['playa', 'cascada', 'bosque']);
    expect(response.body.chapters[0].id).toBe(expected[0].id);
    expect(response.body.chapters[0].ranges).toEqual(expected[0].ranges);
  });

  it('Diego GET retired Paisajes I is 404 COURSE_NOT_FOUND (not enrolled)', async () => {
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('draft and in_review still 404 COURSE_NOT_FOUND after another course is retired', async () => {
    const cookie = await loginAs('bruno');
    const inReview = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-ii')
      .set('Cookie', cookie);
    const draft = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-iii')
      .set('Cookie', cookie);

    expect(inReview.status).toBe(404);
    expect(inReview.body.code).toBe('COURSE_NOT_FOUND');
    expect(draft.status).toBe(404);
    expect(draft.body.code).toBe('COURSE_NOT_FOUND');
  });
});
