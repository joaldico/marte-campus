import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
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

function seedPrisma() {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));
  const events = [
    ...buildSeedPlaybackRecords(),
    {
      id: 'rejected-hole-cascada',
      userId: 'carla',
      videoId: 'cascada',
      fromS: 7,
      toS: 8,
      rate: 1,
      at: new Date('2026-09-16T12:00:00.000Z'),
      accepted: false,
      rejectReason: 'inverted_interval',
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
  };
}

describe('GET /admin/videos/:id/heatmap (T-7.2 / CA-08)', () => {
  let app: INestApplication;

  async function loginAs(userId: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId });
    expect(login.status).toBe(200);
    return cookieHeader(login.headers['set-cookie']);
  }

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

  it('returns 401 without a session cookie', async () => {
    const response = await request(app.getHttpServer()).get(
      '/admin/videos/cascada/heatmap',
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when Bruno (student) requests heatmap', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/admin/videos/cascada/heatmap')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('returns 404 VIDEO_NOT_FOUND for unknown video', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .get('/admin/videos/rio/heatmap')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('VIDEO_NOT_FOUND');
  });

  it('Ana heatmap cascada: duration 11, seconds 0–7 and 8–11 watched, t=7 skip', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .get('/admin/videos/cascada/heatmap')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.durationSeconds).toBe(11);
    expect(response.body.buckets).toHaveLength(11);
    expect(response.body.buckets.map((bucket: { t: number }) => bucket.t)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    expect(response.body.buckets[7]).toEqual({
      t: 7,
      watchedWeight: 0,
      skipWeight: 1,
    });

    for (const t of [0, 1, 2, 3, 4, 5, 6, 8, 9, 10]) {
      expect(response.body.buckets[t].watchedWeight).toBeGreaterThanOrEqual(1);
      expect(response.body.buckets[t].skipWeight).toBe(0);
    }
  });
});
