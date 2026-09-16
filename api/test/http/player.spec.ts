import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { merge, uniqueSeconds } from '../../src/domain/progress';
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

function expectedMergedRanges(userId: string, videoId: string) {
  const events = buildSeedPlaybackRecords();
  return merge(
    events
      .filter(
        (row) =>
          row.accepted && row.userId === userId && row.videoId === videoId,
      )
      .map((row) => ({ from: row.fromS, to: row.toS })),
  );
}

function seedPrisma(
  cursors: { userId: string; videoId: string; positionSeconds: number }[] = [],
) {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));
  const enrollments = SEED_ENROLLMENTS.map((row) => ({
    id: `enroll-${row.userId}-${row.courseId}`,
    userId: row.userId,
    courseId: row.courseId,
  }));
  const events = buildSeedPlaybackRecords();

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
    chapter: {
      findUnique: jest.fn(
        async (args: {
          where: { id: string };
          include?: {
            version?: {
              include?: {
                course?: {
                  include?: {
                    enrollments?: { where?: { userId?: string } };
                    publishedVersion?: unknown;
                  };
                };
              };
            };
          };
        }) => {
          for (const course of SEED_COURSES) {
            const chapter = course.version.chapters.find(
              (row) => row.id === args.where.id,
            );
            if (!chapter) {
              continue;
            }
            const enrollmentUserId =
              args.include?.version?.include?.course?.include?.enrollments?.where
                ?.userId;
            const courseEnrollments = enrollments.filter((row) => {
              if (row.courseId !== course.id) {
                return false;
              }
              if (enrollmentUserId && row.userId !== enrollmentUserId) {
                return false;
              }
              return true;
            });
            const publishedChapters =
              course.status === 'published'
                ? [...course.version.chapters]
                    .sort((a, b) => a.position - b.position)
                    .map((row) => ({
                      ...row,
                      video:
                        VIDEO_DURATIONS.find((video) => video.id === row.videoId) ??
                        null,
                    }))
                : [];
            return {
              id: chapter.id,
              title: chapter.title,
              position: chapter.position,
              videoId: chapter.videoId,
              versionId: course.version.id,
              video:
                VIDEO_DURATIONS.find((video) => video.id === chapter.videoId) ??
                null,
              version: {
                id: course.version.id,
                courseId: course.id,
                course: {
                  id: course.id,
                  title: course.title,
                  status: course.status,
                  publishedVersionId:
                    course.status === 'published' ? course.version.id : null,
                  enrollments: courseEnrollments,
                  publishedVersion:
                    course.status === 'published'
                      ? {
                          id: course.version.id,
                          chapters: publishedChapters,
                        }
                      : null,
                },
              },
            };
          }
          return null;
        },
      ),
    },
    video: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        return VIDEO_DURATIONS.find((video) => video.id === id) ?? null;
      }),
    },
    playbackEvent: {
      findMany: jest.fn(
        async (
          args: {
            where?: { userId?: string; accepted?: boolean; videoId?: unknown };
          } = {},
        ) => {
          return events.filter((row) => {
            if (args.where?.userId && row.userId !== args.where.userId) {
              return false;
            }
            if (
              args.where?.accepted !== undefined &&
              row.accepted !== args.where.accepted
            ) {
              return false;
            }
            return matchVideoId(row.videoId, args.where?.videoId);
          });
        },
      ),
    },
    playbackCursor: {
      findUnique: jest.fn(
        async ({
          where: { userId_videoId },
        }: {
          where: { userId_videoId?: { userId: string; videoId: string } };
        }) => {
          if (!userId_videoId) {
            return null;
          }
          return (
            cursors.find(
              (row) =>
                row.userId === userId_videoId.userId &&
                row.videoId === userId_videoId.videoId,
            ) ?? null
          );
        },
      ),
    },
  };
}

describe('GET /player/chapters/:chapterId', () => {
  let app: INestApplication;
  const previousProxy = process.env.VIDEO_PROXY;

  async function loginAs(userId: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId });
    expect(login.status).toBe(200);
    return cookieHeader(login.headers['set-cookie']);
  }

  async function boot(
    cursors: { userId: string; videoId: string; positionSeconds: number }[] = [],
  ) {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(seedPrisma(cursors))
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (previousProxy === undefined) {
      delete process.env.VIDEO_PROXY;
    } else {
      process.env.VIDEO_PROXY = previousProxy;
    }
  });

  it('returns 401 without a session cookie', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const response = await request(app.getHttpServer()).get(
      '/player/chapters/paisajes-i-ch-1',
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 COURSE_NOT_FOUND when the chapter id is unknown', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/does-not-exist')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('returns 404 COURSE_NOT_FOUND for unpublished Paisajes II chapter (no leak)', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/paisajes-ii-ch-1')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('returns 403 NOT_ENROLLED when Diego hits a published Paisajes I chapter', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('NOT_ENROLLED');
  });

  it('Bruno playa: 200 with proxy url, merged seed ranges, cursor 0, next cascada', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const expectedRanges = expectedMergedRanges('bruno', 'playa');
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'paisajes-i-ch-1',
        videoId: 'playa',
        title: 'Playa',
        position: 1,
        url: '/videos/playa/stream',
        cursor: 0,
        siblings: { previousId: null, nextId: 'paisajes-i-ch-2' },
      }),
    );
    expect(response.body.ranges).toEqual(expectedRanges);
  });

  it('Bruno cascada: merged overlapping ranges uniqueSeconds=10 and both siblings', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const expectedRanges = expectedMergedRanges('bruno', 'cascada');
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('paisajes-i-ch-2');
    expect(response.body.videoId).toBe('cascada');
    expect(response.body.ranges).toEqual(expectedRanges);
    expect(uniqueSeconds(response.body.ranges)).toBe(10);
    expect(response.body.cursor).toBe(0);
    expect(response.body.siblings).toEqual({
      previousId: 'paisajes-i-ch-1',
      nextId: 'paisajes-i-ch-3',
    });
  });

  it('Bruno bosque: last sibling next is null and cursor is stored PlaybackCursor not last event to', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot([{ userId: 'bruno', videoId: 'bosque', positionSeconds: 4 }]);
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/paisajes-i-ch-3')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.cursor).toBe(4);
    expect(response.body.siblings).toEqual({
      previousId: 'paisajes-i-ch-2',
      nextId: null,
    });
  });

  it('uses Video.origin url when VIDEO_PROXY is not true', async () => {
    process.env.VIDEO_PROXY = 'false';
    await boot();
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/player/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(playa?.url);
  });
});
