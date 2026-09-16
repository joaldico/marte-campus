import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SEED_USERS, VIDEO_DURATIONS } from '../../prisma/seed';

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
  };
}

describe('GET /videos/:id/stream', () => {
  let app: INestApplication;
  const previousProxy = process.env.VIDEO_PROXY;
  const previousTimeout = process.env.VIDEO_ORIGIN_TIMEOUT_MS;
  const previousFetch = global.fetch;

  async function loginAs(userId: string): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId });
    expect(login.status).toBe(200);
    return cookieHeader(login.headers['set-cookie']);
  }

  async function boot() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(seedPrisma())
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
    if (previousTimeout === undefined) {
      delete process.env.VIDEO_ORIGIN_TIMEOUT_MS;
    } else {
      process.env.VIDEO_ORIGIN_TIMEOUT_MS = previousTimeout;
    }
    global.fetch = previousFetch;
  });

  it('returns 401 without a session cookie', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const response = await request(app.getHttpServer()).get('/videos/playa/stream');
    expect(response.status).toBe(401);
  });

  it('returns 404 when the Video row is missing (rio can exist in events)', async () => {
    process.env.VIDEO_PROXY = 'true';
    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/videos/rio/stream')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('VIDEO_NOT_FOUND');
  });

  it('proxies Range to origin and pipes 206 plus Accept-Ranges and Content-Range', async () => {
    process.env.VIDEO_PROXY = 'true';
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    if (!playa) {
      throw new Error('missing playa seed video');
    }
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(Buffer.from('ab'), {
        status: 206,
        headers: {
          'Content-Range': 'bytes 0-1/1000',
          'Content-Type': 'video/mp4',
          'Content-Length': '2',
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/videos/playa/stream')
      .set('Cookie', cookie)
      .set('Range', 'bytes=0-1');

    expect(response.status).toBe(206);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-range']).toBe('bytes 0-1/1000');
    expect(response.body).toEqual(Buffer.from('ab'));
    expect(fetchMock).toHaveBeenCalledWith(
      playa.url,
      expect.objectContaining({
        headers: expect.objectContaining({ Range: 'bytes=0-1' }),
      }),
    );
  });

  it('redirects 302 to origin when VIDEO_PROXY is false', async () => {
    process.env.VIDEO_PROXY = 'false';
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/videos/playa/stream')
      .set('Cookie', cookie)
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(playa?.url);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 VIDEO_ORIGIN_ERROR JSON when origin fetch fails before headers', async () => {
    process.env.VIDEO_PROXY = 'true';
    global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND')) as unknown as typeof fetch;

    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/videos/playa/stream')
      .set('Cookie', cookie);

    expect(response.status).toBe(502);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'VIDEO_ORIGIN_ERROR',
        message: expect.any(String),
      }),
    );
  });

  it('returns 502 VIDEO_ORIGIN_ERROR when origin fetch times out', async () => {
    process.env.VIDEO_PROXY = 'true';
    process.env.VIDEO_ORIGIN_TIMEOUT_MS = '40';
    const fetchMock = jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await boot();
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .get('/videos/playa/stream')
      .set('Cookie', cookie);

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('VIDEO_ORIGIN_ERROR');
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('aborts origin fetch when the client request closes', async () => {
    process.env.VIDEO_PROXY = 'true';
    const { EventEmitter } = await import('node:events');
    const { VideosService } = await import('../../src/videos/videos.service');
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    if (!playa) {
      throw new Error('missing playa seed video');
    }

    let signal: AbortSignal | undefined;
    global.fetch = jest.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) => {
        signal = init?.signal;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      },
    ) as unknown as typeof fetch;

    const req = new EventEmitter();
    Object.assign(req, { destroyed: false });
    const res = {
      headersSent: false,
      writableEnded: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn(),
      redirect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    const service = new VideosService({
      video: {
        findUnique: jest.fn(async () => playa),
      },
    } as never);

    const streaming = service.stream('playa', undefined, req as never, res as never);
    const started = Date.now();
    while (!signal && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    req.emit('close');
    await streaming;
    expect(signal?.aborted).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
