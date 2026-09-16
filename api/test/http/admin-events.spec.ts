import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SEED_USERS, VIDEO_DURATIONS } from '../../prisma/seed';

const CSV_3_1 = path.join(__dirname, '../fixtures/events-3.1.csv');

function cookieHeader(setCookie: string | string[] | undefined): string {
  const parts = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

type EventRow = {
  id: string;
  userId: string;
  videoId: string;
  fromS: number;
  toS: number;
  rate: number;
  at: Date;
  accepted: boolean;
  rejectReason: string | null;
};

function seedPrisma(events: EventRow[] = []) {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));

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
    },
    playbackEvent: {
      findMany: jest.fn(async () => events.slice()),
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
            id: `import-ev-${events.length + 1}`,
            ...data,
          };
          events.push(row);
          return row;
        },
      ),
    },
  };
}

describe('POST /admin/events/import (T-7.1 / CA-08)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof seedPrisma>;

  async function loginAs(userId: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId });
    expect(login.status).toBe(200);
    return cookieHeader(login.headers['set-cookie']);
  }

  beforeEach(async () => {
    prisma = seedPrisma([]);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 without a session cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/events/import')
      .attach('file', CSV_3_1);

    expect(response.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when Bruno (student) imports', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .post('/admin/events/import')
      .set('Cookie', cookie)
      .attach('file', CSV_3_1);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('Ana imports CSV 3.1: 11 accepted, 2 rejected, every row persisted', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .post('/admin/events/import')
      .set('Cookie', cookie)
      .attach('file', CSV_3_1);

    expect(response.status).toBe(200);
    expect(response.body.accepted).toBe(11);
    expect(response.body.rejected).toEqual(
      expect.arrayContaining([
        { reason: 'inverted_interval', count: 1 },
        { reason: 'unknown_video', count: 1 },
      ]),
    );
    expect(response.body.rejected).toHaveLength(2);

    const stored = await prisma.playbackEvent.findMany();
    expect(stored).toHaveLength(13);
    expect(stored.filter((row) => row.accepted)).toHaveLength(11);

    const inverted = stored.find(
      (row) => row.userId === 'carla' && row.videoId === 'cascada' && row.fromS === 8,
    );
    expect(inverted).toMatchObject({
      toS: 2,
      accepted: false,
      rejectReason: 'inverted_interval',
    });

    const unknown = stored.find((row) => row.userId === 'carla' && row.videoId === 'rio');
    expect(unknown).toMatchObject({
      fromS: 0,
      toS: 10,
      accepted: false,
      rejectReason: 'unknown_video',
    });
  });
});
