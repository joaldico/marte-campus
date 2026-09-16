import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { chapterProgress, merge, uniqueSeconds } from '../../src/domain/progress';
import {
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

function seedAcceptedIntervals(userId: string, videoId: string) {
  return buildSeedPlaybackRecords()
    .filter(
      (row) => row.accepted && row.userId === userId && row.videoId === videoId,
    )
    .map((row) => ({ from: row.fromS, to: row.toS }));
}

function seedPrisma(
  cursors: { userId: string; videoId: string; positionSeconds: number }[] = [],
) {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));
  const events = buildSeedPlaybackRecords();
  const cursorRows = cursors.map((row) => ({ ...row }));

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
    video: {
      findMany: jest.fn(async () => VIDEO_DURATIONS.map((video) => ({ ...video }))),
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
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            videoId: string;
            fromS: number;
            toS: number;
            rate: number;
            at: Date;
            accepted: boolean;
            rejectReason: string | null;
          };
        }) => {
          const row = {
            id: `live-ev-${events.length + 1}`,
            ...data,
          };
          events.push(row);
          return row;
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
            cursorRows.find(
              (row) =>
                row.userId === userId_videoId.userId &&
                row.videoId === userId_videoId.videoId,
            ) ?? null
          );
        },
      ),
      upsert: jest.fn(
        async ({
          where: { userId_videoId },
          create,
          update,
        }: {
          where: { userId_videoId: { userId: string; videoId: string } };
          create: { userId: string; videoId: string; positionSeconds: number };
          update: { positionSeconds: number };
        }) => {
          const existing = cursorRows.find(
            (row) =>
              row.userId === userId_videoId.userId &&
              row.videoId === userId_videoId.videoId,
          );
          if (existing) {
            existing.positionSeconds = update.positionSeconds;
            return existing;
          }
          const row = { ...create };
          cursorRows.push(row);
          return row;
        },
      ),
    },
  };
}

describe('POST /playback/events', () => {
  let app: INestApplication;

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
    const prisma = seedPrisma(cursors);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    return prisma;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 401 without a session cookie', async () => {
    await boot();
    const response = await request(app.getHttpServer())
      .post('/playback/events')
      .send({ videoId: 'playa', from: 10, to: 12, rate: 1 });
    expect(response.status).toBe(401);
  });

  it('Carla playa 10–12 unites seed [0,10) to [0,12), cursor 12, chapter completed', async () => {
    await boot();
    const expectedRanges = merge([
      ...seedAcceptedIntervals('carla', 'playa'),
      { from: 10, to: 12 },
    ]);
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    const expectedProgress = chapterProgress(
      uniqueSeconds(expectedRanges),
      playa?.durationSeconds,
    );

    const cookie = await loginAs('carla');
    const response = await request(app.getHttpServer())
      .post('/playback/events')
      .set('Cookie', cookie)
      .send({ videoId: 'playa', from: 10, to: 12, rate: 1 });

    expect([200, 201]).toContain(response.status);
    expect(response.body.accepted).toBe(true);
    expect(response.body.ranges).toEqual(expectedRanges);
    expect(response.body.cursor).toBe(12);
    expect(response.body.chapterProgress.completed).toBe(true);
    expect(response.body.chapterProgress.completed).toBe(expectedProgress.completed);
  });

  it('inverted from>=to persists accepted false inverted_interval and does not move cursor', async () => {
    const prisma = await boot([
      { userId: 'carla', videoId: 'playa', positionSeconds: 7 },
    ]);
    const expectedRanges = merge(seedAcceptedIntervals('carla', 'playa'));
    const cookie = await loginAs('carla');
    const response = await request(app.getHttpServer())
      .post('/playback/events')
      .set('Cookie', cookie)
      .send({ videoId: 'playa', from: 12, to: 10, rate: 1 });

    expect([200, 201]).toContain(response.status);
    expect(response.body.accepted).toBe(false);
    expect(response.body.rejectReason).toBe('inverted_interval');
    expect(response.body.cursor).toBe(7);
    expect(response.body.ranges).toEqual(expectedRanges);

    const stored = await prisma.playbackEvent.findMany({
      where: { userId: 'carla', videoId: 'playa' },
    });
    expect(
      stored.some(
        (row) =>
          row.accepted === false &&
          row.rejectReason === 'inverted_interval' &&
          row.fromS === 12 &&
          row.toS === 10,
      ),
    ).toBe(true);
  });

  it('unknown videoId rio persists reject unknown_video with empty ranges and cursor 0', async () => {
    const prisma = await boot();
    const cookie = await loginAs('carla');
    const response = await request(app.getHttpServer())
      .post('/playback/events')
      .set('Cookie', cookie)
      .send({ videoId: 'rio', from: 0, to: 10, rate: 1 });

    expect([200, 201]).toContain(response.status);
    expect(response.body.accepted).toBe(false);
    expect(response.body.rejectReason).toBe('unknown_video');
    expect(response.body.ranges).toEqual([]);
    expect(response.body.cursor).toBe(0);
    expect(response.body.chapterProgress.completed).toBe(false);
    expect(response.body.chapterProgress.durationSeconds).toBe(0);

    const stored = await prisma.playbackEvent.findMany({
      where: { userId: 'carla', videoId: 'rio' },
    });
    expect(
      stored.some(
        (row) =>
          row.accepted === false &&
          row.rejectReason === 'unknown_video' &&
          row.fromS === 0 &&
          row.toS === 10,
      ),
    ).toBe(true);
  });

  it('Diego can POST playa events without enrollment', async () => {
    await boot();
    const expectedRanges = merge([
      ...seedAcceptedIntervals('diego', 'playa'),
      { from: 10, to: 12 },
    ]);
    const cookie = await loginAs('diego');
    const response = await request(app.getHttpServer())
      .post('/playback/events')
      .set('Cookie', cookie)
      .send({ videoId: 'playa', from: 10, to: 12, rate: 1 });

    expect([200, 201]).toContain(response.status);
    expect(response.body.accepted).toBe(true);
    expect(response.body.ranges).toEqual(expectedRanges);
    expect(response.body.cursor).toBe(12);
  });
});

describe('PATCH /playback/cursor', () => {
  let app: INestApplication;

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
    const prisma = seedPrisma(cursors);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    return prisma;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 401 without a session cookie', async () => {
    await boot();
    const response = await request(app.getHttpServer())
      .patch('/playback/cursor')
      .send({ videoId: 'playa', positionSeconds: 4 });
    expect(response.status).toBe(401);
  });

  it('returns 404 VIDEO_NOT_FOUND for unknown video rio', async () => {
    await boot();
    const cookie = await loginAs('carla');
    const response = await request(app.getHttpServer())
      .patch('/playback/cursor')
      .set('Cookie', cookie)
      .send({ videoId: 'rio', positionSeconds: 4 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('VIDEO_NOT_FOUND');
  });

  it('returns 400 with code when positionSeconds is not a finite number >= 0', async () => {
    await boot();
    const cookie = await loginAs('carla');

    for (const positionSeconds of [Number.NaN, -1, Number.POSITIVE_INFINITY, '4']) {
      const response = await request(app.getHttpServer())
        .patch('/playback/cursor')
        .set('Cookie', cookie)
        .send({ videoId: 'playa', positionSeconds });

      expect(response.status).toBe(400);
      expect(response.body.code).toBeDefined();
      expect(response.body.message).toBeDefined();
    }
  });

  it('upserts resume position without creating an interval', async () => {
    const prisma = await boot();
    const expectedRanges = merge(seedAcceptedIntervals('carla', 'playa'));
    const cookie = await loginAs('carla');

    const patched = await request(app.getHttpServer())
      .patch('/playback/cursor')
      .set('Cookie', cookie)
      .send({ videoId: 'playa', positionSeconds: 6 });
    expect(patched.status).toBe(200);
    expect(patched.body.positionSeconds).toBe(6);

    const rejected = await request(app.getHttpServer())
      .post('/playback/events')
      .set('Cookie', cookie)
      .send({ videoId: 'playa', from: 12, to: 10, rate: 1 });
    expect(rejected.body.accepted).toBe(false);
    expect(rejected.body.cursor).toBe(6);
    expect(rejected.body.ranges).toEqual(expectedRanges);

    const playaEvents = await prisma.playbackEvent.findMany({
      where: { userId: 'carla', videoId: 'playa', accepted: true },
    });
    expect(
      playaEvents.map((row) => ({ from: row.fromS, to: row.toS })),
    ).toEqual(seedAcceptedIntervals('carla', 'playa'));
  });

  it('lets Bruno PATCH atardecer cursor without enrollment on Paisajes II', async () => {
    const prisma = await boot();
    const before = await prisma.playbackEvent.findMany();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .patch('/playback/cursor')
      .set('Cookie', cookie)
      .send({ videoId: 'atardecer', positionSeconds: 9 });

    expect(response.status).toBe(200);
    expect(response.body.positionSeconds).toBe(9);
    const after = await prisma.playbackEvent.findMany();
    expect(after).toHaveLength(before.length);
  });
});
