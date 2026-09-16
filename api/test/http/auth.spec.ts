import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const USERS = [
  { id: 'ana', name: 'Ana', role: 'admin' },
  { id: 'bruno', name: 'Bruno', role: 'student' },
  { id: 'carla', name: 'Carla', role: 'student' },
  { id: 'diego', name: 'Diego', role: 'student' },
];

function cookieHeader(setCookie: string | string[] | undefined): string {
  const parts = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

function setCookieBlob(setCookie: string | string[] | undefined): string {
  const parts = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return parts.join('\n');
}

describe('Auth CA-01', () => {
  let app: INestApplication;
  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    prisma.user.findMany.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.session.create.mockReset();
    prisma.session.findUnique.mockReset();
    prisma.session.delete.mockReset();

    prisma.user.findMany.mockResolvedValue(USERS);
    prisma.user.findUnique.mockImplementation(async ({ where: { id } }) => {
      return USERS.find((u) => u.id === id) ?? null;
    });
    prisma.session.create.mockImplementation(async ({ data }) => {
      const user = USERS.find((u) => u.id === data.userId);
      return {
        id: 'sess-bruno',
        userId: data.userId,
        expiresAt: data.expiresAt,
        user,
      };
    });
    prisma.session.findUnique.mockImplementation(async ({ where: { id } }) => {
      if (id !== 'sess-bruno') return null;
      return {
        id: 'sess-bruno',
        userId: 'bruno',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: USERS.find((u) => u.id === 'bruno'),
      };
    });
    prisma.session.delete.mockResolvedValue({ id: 'sess-bruno' });

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

  it('GET /auth/users lists ana, bruno, carla, diego as { id, name, role } without auth', async () => {
    const response = await request(app.getHttpServer()).get('/auth/users');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(USERS);
    expect(prisma.user.findMany).toHaveBeenCalled();
  });

  it('POST /auth/login sets httpOnly SameSite=Lax sid and creates a Session', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId: 'bruno' });

    expect(response.status).toBe(200);
    const blob = setCookieBlob(response.headers['set-cookie']);
    expect(blob).toMatch(/sid=sess-bruno/i);
    expect(blob).toMatch(/HttpOnly/i);
    expect(blob).toMatch(/SameSite=Lax/i);
    expect(blob).not.toMatch(/Secure/i);
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'bruno' }),
      }),
    );
  });

  it('POST /auth/login sets Secure only when X-Forwarded-Proto is https', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ userId: 'bruno' });

    expect(response.status).toBe(200);
    expect(setCookieBlob(response.headers['set-cookie'])).toMatch(/Secure/i);
  });

  it('GET /auth/me returns 401 without cookie', async () => {
    const response = await request(app.getHttpServer()).get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('GET /auth/me returns Bruno from the session cookie, not a body userId', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId: 'bruno' });

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookieHeader(login.headers['set-cookie']))
      .send({ userId: 'ana' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({ name: 'Bruno', role: 'student' }),
    );
    expect(response.body.id).toBe('bruno');
  });

  it('POST /auth/logout clears the cookie and deletes the session', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ userId: 'bruno' });

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookieHeader(login.headers['set-cookie']));

    expect(response.status).toBe(200);
    const blob = setCookieBlob(response.headers['set-cookie']);
    expect(blob).toMatch(/sid=/i);
    expect(blob).toMatch(/Max-Age=0|Expires=/i);
    expect(prisma.session.delete).toHaveBeenCalledWith({
      where: { id: 'sess-bruno' },
    });
  });
});
