import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SEED_COURSES, SEED_USERS, VIDEO_DURATIONS } from '../../prisma/seed';

function cookieHeader(setCookie: string | string[] | undefined): string {
  const parts = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

type VideoRow = { id: string; url: string; durationSeconds: number | null };
type ChapterRow = {
  id: string;
  versionId: string;
  videoId: string;
  title: string;
  position: number;
};
type VersionRow = {
  id: string;
  courseId: string;
  revisionStatus: string;
  versionNumber: number;
};
type CourseRow = {
  id: string;
  title: string;
  status: string;
  publishedVersionId: string | null;
  workingVersionId: string | null;
};

function seedPrisma() {
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const users = SEED_USERS.map((user) => ({ ...user }));
  const videos: VideoRow[] = VIDEO_DURATIONS.map((video) => ({ ...video }));
  const versions: VersionRow[] = SEED_COURSES.map((course) => ({
    id: course.version.id,
    courseId: course.id,
    revisionStatus: course.version.revisionStatus,
    versionNumber: course.version.versionNumber,
  }));
  const chapters: ChapterRow[] = SEED_COURSES.flatMap((course) =>
    course.version.chapters.map((chapter) => ({
      id: chapter.id,
      versionId: course.version.id,
      videoId: chapter.videoId,
      title: chapter.title,
      position: chapter.position,
    })),
  );
  const courses: CourseRow[] = SEED_COURSES.map((course) => ({
    id: course.id,
    title: course.title,
    status: course.status,
    publishedVersionId: course.status === 'published' ? course.version.id : null,
    workingVersionId: course.version.id,
  }));

  const hydrateVersion = (version: VersionRow, include?: Record<string, unknown>) => {
    const row: Record<string, unknown> = { ...version };
    const chapterArg = include?.chapters as
      | boolean
      | { orderBy?: { position?: string }; include?: { video?: boolean } }
      | undefined;
    if (chapterArg) {
      const chapterInclude = chapterArg === true ? {} : chapterArg;
      let rows = chapters.filter((chapter) => chapter.versionId === version.id);
      if (chapterInclude.orderBy?.position === 'asc') {
        rows = [...rows].sort((a, b) => a.position - b.position);
      } else if (chapterInclude.orderBy?.position === 'desc') {
        rows = [...rows].sort((a, b) => b.position - a.position);
      }
      row.chapters = rows.map((chapter) => {
        const hydrated: Record<string, unknown> = { ...chapter };
        if (chapterInclude.include?.video) {
          hydrated.video = videos.find((video) => video.id === chapter.videoId) ?? null;
        }
        return hydrated;
      });
    }
    return row;
  };

  const hydrateCourse = (course: CourseRow, include?: Record<string, unknown>) => {
    const row: Record<string, unknown> = { ...course };
    const workingArg = include?.workingVersion as
      | boolean
      | { include?: Record<string, unknown> }
      | undefined;
    if (workingArg) {
      const version = versions.find((item) => item.id === course.workingVersionId);
      const nested =
        workingArg === true ? undefined : (workingArg.include as Record<string, unknown>);
      row.workingVersion = version ? hydrateVersion(version, nested) : null;
    }
    const publishedArg = include?.publishedVersion as
      | boolean
      | { include?: Record<string, unknown> }
      | undefined;
    if (publishedArg) {
      const version = versions.find((item) => item.id === course.publishedVersionId);
      const nested =
        publishedArg === true
          ? undefined
          : (publishedArg.include as Record<string, unknown>);
      row.publishedVersion = version ? hydrateVersion(version, nested) : null;
    }
    const versionsArg = include?.versions as
      | boolean
      | { include?: Record<string, unknown> }
      | undefined;
    if (versionsArg) {
      const nested =
        versionsArg === true ? undefined : (versionsArg.include as Record<string, unknown>);
      row.versions = versions
        .filter((item) => item.courseId === course.id)
        .map((item) => hydrateVersion(item, nested));
    }
    return row;
  };

  const prisma: Record<string, unknown> = {};

  prisma.user = {
    findMany: jest.fn(async () => users),
    findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
      return users.find((user) => user.id === id) ?? null;
    }),
  };
  prisma.session = {
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
  };
  prisma.video = {
    findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
      return videos.find((video) => video.id === id) ?? null;
    }),
    findFirst: jest.fn(async ({ where }: { where?: { url?: string; id?: string } } = {}) => {
      return (
        videos.find((video) => {
          if (where?.url && video.url !== where.url) {
            return false;
          }
          if (where?.id && video.id !== where.id) {
            return false;
          }
          return true;
        }) ?? null
      );
    }),
    create: jest.fn(async ({ data }: { data: VideoRow }) => {
      const row = {
        id: data.id,
        url: data.url,
        durationSeconds: data.durationSeconds ?? null,
      };
      videos.push(row);
      return row;
    }),
  };
  prisma.course = {
    findMany: jest.fn(
      async (
        args: {
          include?: Record<string, unknown>;
          orderBy?: { title?: string };
        } = {},
      ) => {
        let rows = courses.map((course) => hydrateCourse(course, args.include));
        if (args.orderBy?.title === 'asc') {
          rows = [...rows].sort((a, b) =>
            String(a.title).localeCompare(String(b.title)),
          );
        }
        return rows;
      },
    ),
    findUnique: jest.fn(
      async (args: { where: { id: string }; include?: Record<string, unknown> }) => {
        const course = courses.find((row) => row.id === args.where.id);
        if (!course) {
          return null;
        }
        return hydrateCourse(course, args.include);
      },
    ),
    create: jest.fn(async ({ data }: { data: Partial<CourseRow> & { title: string } }) => {
      const row: CourseRow = {
        id: data.id ?? `course-${courses.length + 1}`,
        title: data.title,
        status: data.status ?? 'draft',
        publishedVersionId: data.publishedVersionId ?? null,
        workingVersionId: data.workingVersionId ?? null,
      };
      courses.push(row);
      return { ...row };
    }),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<CourseRow>;
        include?: Record<string, unknown>;
      }) => {
        const course = courses.find((row) => row.id === args.where.id);
        if (!course) {
          return null;
        }
        Object.assign(course, args.data);
        return hydrateCourse(course, args.include);
      },
    ),
  };
  prisma.courseVersion = {
    create: jest.fn(
      async ({
        data,
      }: {
        data: {
          id?: string;
          courseId: string;
          revisionStatus: string;
          versionNumber: number;
        };
      }) => {
        const row: VersionRow = {
          id: data.id ?? `version-${versions.length + 1}`,
          courseId: data.courseId,
          revisionStatus: data.revisionStatus,
          versionNumber: data.versionNumber,
        };
        versions.push(row);
        return { ...row };
      },
    ),
    findUnique: jest.fn(
      async (args: { where: { id: string }; include?: Record<string, unknown> }) => {
        const version = versions.find((row) => row.id === args.where.id);
        if (!version) {
          return null;
        }
        return hydrateVersion(version, args.include);
      },
    ),
  };
  prisma.chapter = {
    findMany: jest.fn(
      async (
        args: {
          where?: { versionId?: string };
          orderBy?: { position?: string };
          include?: { video?: boolean };
        } = {},
      ) => {
        let rows = chapters.filter((chapter) => {
          if (args.where?.versionId && chapter.versionId !== args.where.versionId) {
            return false;
          }
          return true;
        });
        if (args.orderBy?.position === 'asc') {
          rows = [...rows].sort((a, b) => a.position - b.position);
        } else if (args.orderBy?.position === 'desc') {
          rows = [...rows].sort((a, b) => b.position - a.position);
        }
        return rows.map((chapter) => {
          const hydrated: Record<string, unknown> = { ...chapter };
          if (args.include?.video) {
            hydrated.video = videos.find((video) => video.id === chapter.videoId) ?? null;
          }
          return hydrated;
        });
      },
    ),
    findUnique: jest.fn(
      async (args: {
        where: { id: string };
        include?: { video?: boolean; version?: boolean };
      }) => {
        const chapter = chapters.find((row) => row.id === args.where.id);
        if (!chapter) {
          return null;
        }
        const hydrated: Record<string, unknown> = { ...chapter };
        if (args.include?.video) {
          hydrated.video = videos.find((video) => video.id === chapter.videoId) ?? null;
        }
        if (args.include?.version) {
          hydrated.version = versions.find((row) => row.id === chapter.versionId) ?? null;
        }
        return hydrated;
      },
    ),
    create: jest.fn(
      async ({
        data,
        include,
      }: {
        data: Omit<ChapterRow, 'id'> & { id?: string };
        include?: { video?: boolean };
      }) => {
        const row: ChapterRow = {
          id: data.id ?? `chapter-${chapters.length + 1}`,
          versionId: data.versionId,
          videoId: data.videoId,
          title: data.title,
          position: data.position,
        };
        chapters.push(row);
        const hydrated: Record<string, unknown> = { ...row };
        if (include?.video) {
          hydrated.video = videos.find((video) => video.id === row.videoId) ?? null;
        }
        return hydrated;
      },
    ),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<ChapterRow>;
        include?: { video?: boolean };
      }) => {
        const chapter = chapters.find((row) => row.id === args.where.id);
        if (!chapter) {
          return null;
        }
        Object.assign(chapter, args.data);
        const hydrated: Record<string, unknown> = { ...chapter };
        if (args.include?.video) {
          hydrated.video = videos.find((video) => video.id === chapter.videoId) ?? null;
        }
        return hydrated;
      },
    ),
    delete: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
      const index = chapters.findIndex((row) => row.id === id);
      if (index < 0) {
        return null;
      }
      const [removed] = chapters.splice(index, 1);
      return removed;
    }),
  };
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });

  return prisma;
}

describe('Admin courses HTTP (T-6.1 / CA-05)', () => {
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
    const list = await request(app.getHttpServer()).get('/admin/courses');
    expect(list.status).toBe(401);

    const create = await request(app.getHttpServer())
      .post('/admin/courses')
      .send({ title: 'Paisajes IV' });
    expect(create.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when Bruno (student) hits admin courses', async () => {
    const cookie = await loginAs('bruno');
    const list = await request(app.getHttpServer())
      .get('/admin/courses')
      .set('Cookie', cookie);

    expect(list.status).toBe(403);
    expect(list.body.code).toBe('FORBIDDEN');
    expect(list.body.message).toBeTruthy();

    const create = await request(app.getHttpServer())
      .post('/admin/courses')
      .set('Cookie', cookie)
      .send({ title: 'Paisajes IV' });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe('FORBIDDEN');
  });

  it('lists every course with working-version chapterCount', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .get('/admin/courses')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const byId = Object.fromEntries(
      response.body.map((row: { id: string }) => [row.id, row]),
    );
    expect(byId['paisajes-i']).toEqual(
      expect.objectContaining({
        id: 'paisajes-i',
        title: 'Paisajes I',
        status: 'published',
        chapterCount: 3,
      }),
    );
    expect(byId['paisajes-ii']).toEqual(
      expect.objectContaining({
        id: 'paisajes-ii',
        title: 'Paisajes II',
        status: 'in_review',
        chapterCount: 2,
      }),
    );
    expect(byId['paisajes-iii']).toEqual(
      expect.objectContaining({
        id: 'paisajes-iii',
        title: 'Paisajes III',
        status: 'draft',
        chapterCount: 0,
      }),
    );
  });

  it('CA-05: Ana creates Paisajes IV draft, adds 2 chapters, reorders, GET returns new order', async () => {
    const cookie = await loginAs('ana');
    const auroras = VIDEO_DURATIONS.find((video) => video.id === 'auroras');
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    if (!auroras || !playa) {
      throw new Error('seed videos missing');
    }

    const created = await request(app.getHttpServer())
      .post('/admin/courses')
      .set('Cookie', cookie)
      .send({ title: 'Paisajes IV' });

    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Paisajes IV');
    expect(created.body.status).toBe('draft');
    expect(created.body.publishedVersionId).toBeNull();
    expect(created.body.workingVersionId).toBeTruthy();
    expect(created.body.id).toBeTruthy();

    const courseId = created.body.id as string;

    const listed = await request(app.getHttpServer())
      .get('/admin/courses')
      .set('Cookie', cookie);
    expect(listed.status).toBe(200);
    const iv = listed.body.find((row: { title: string }) => row.title === 'Paisajes IV');
    expect(iv).toEqual(
      expect.objectContaining({
        id: courseId,
        title: 'Paisajes IV',
        status: 'draft',
        chapterCount: 0,
      }),
    );

    const first = await request(app.getHttpServer())
      .post(`/admin/courses/${courseId}/chapters`)
      .set('Cookie', cookie)
      .send({ title: 'Auroras', url: auroras.url });
    expect(first.status).toBe(201);
    expect(first.body.title).toBe('Auroras');
    expect(first.body.videoId).toBe('auroras');
    expect(first.body.position).toBe(1);

    const second = await request(app.getHttpServer())
      .post(`/admin/courses/${courseId}/chapters`)
      .set('Cookie', cookie)
      .send({ title: 'Playa', url: playa.url });
    expect(second.status).toBe(201);
    expect(second.body.title).toBe('Playa');
    expect(second.body.videoId).toBe('playa');
    expect(second.body.position).toBe(2);

    const before = await request(app.getHttpServer())
      .get(`/admin/courses/${courseId}`)
      .set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.title).toBe('Paisajes IV');
    expect(before.body.status).toBe('draft');
    expect(before.body.publishedVersionId).toBeNull();
    expect(before.body.workingVersionId).toBe(created.body.workingVersionId);
    expect(Array.isArray(before.body.versions)).toBe(true);
    expect(before.body.versions[0]).toEqual(
      expect.objectContaining({
        id: created.body.workingVersionId,
        revisionStatus: 'draft',
        versionNumber: 1,
      }),
    );
    expect(before.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Auroras',
      'Playa',
    ]);
    expect(
      before.body.chapters.map((chapter: { position: number }) => chapter.position),
    ).toEqual([1, 2]);

    const reordered = await request(app.getHttpServer())
      .patch(`/admin/courses/${courseId}/chapters/order`)
      .set('Cookie', cookie)
      .send({ chapterIds: [second.body.id, first.body.id] });
    expect(reordered.status).toBe(200);

    const after = await request(app.getHttpServer())
      .get(`/admin/courses/${courseId}`)
      .set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([
      second.body.id,
      first.body.id,
    ]);
    expect(after.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Playa',
      'Auroras',
    ]);
    expect(
      after.body.chapters.map((chapter: { position: number }) => chapter.position),
    ).toEqual([1, 2]);
  });

  it('PATCHes course title metadata', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-iii')
      .set('Cookie', cookie)
      .send({ title: 'Paisajes III — meta' });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Paisajes III — meta');
    expect(response.body.status).toBe('draft');
  });

  it('returns 409 CHAPTER_ON_PUBLISHED when mutating Paisajes I working===published', async () => {
    const cookie = await loginAs('ana');
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    if (!playa) {
      throw new Error('seed playa missing');
    }

    const add = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/chapters')
      .set('Cookie', cookie)
      .send({ title: 'Extra', url: playa.url });
    expect(add.status).toBe(409);
    expect(add.body.code).toBe('CHAPTER_ON_PUBLISHED');

    const order = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/order')
      .set('Cookie', cookie)
      .send({
        chapterIds: ['paisajes-i-ch-3', 'paisajes-i-ch-1', 'paisajes-i-ch-2'],
      });
    expect(order.status).toBe(409);
    expect(order.body.code).toBe('CHAPTER_ON_PUBLISHED');

    const patch = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie)
      .send({ title: 'Playa edit' });
    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe('CHAPTER_ON_PUBLISHED');

    const del = await request(app.getHttpServer())
      .delete('/admin/courses/paisajes-i/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('CHAPTER_ON_PUBLISHED');
  });

  it('returns 400 when order ids are not exactly the working set', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-ii/chapters/order')
      .set('Cookie', cookie)
      .send({ chapterIds: ['paisajes-ii-ch-1'] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBeTruthy();
  });

  it('creates a Video for a new url and reuses it by url; PATCHes and DELETEs working chapters', async () => {
    const cookie = await loginAs('ana');
    const created = await request(app.getHttpServer())
      .post('/admin/courses')
      .set('Cookie', cookie)
      .send({ title: 'Paisajes scratch' });
    expect(created.status).toBe(201);
    const courseId = created.body.id as string;
    const novelUrl = 'https://example.com/videos/novel-clip.mp4';

    const added = await request(app.getHttpServer())
      .post(`/admin/courses/${courseId}/chapters`)
      .set('Cookie', cookie)
      .send({ title: 'Novel', url: novelUrl });
    expect(added.status).toBe(201);
    expect(added.body.videoId).toBeTruthy();
    expect(added.body.url).toBe(novelUrl);

    const reuse = await request(app.getHttpServer())
      .post(`/admin/courses/${courseId}/chapters`)
      .set('Cookie', cookie)
      .send({ title: 'Novel again', url: novelUrl });
    expect(reuse.status).toBe(201);
    expect(reuse.body.videoId).toBe(added.body.videoId);

    const patched = await request(app.getHttpServer())
      .patch(`/admin/courses/${courseId}/chapters/${added.body.id}`)
      .set('Cookie', cookie)
      .send({ title: 'Novel renamed' });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe('Novel renamed');

    const removed = await request(app.getHttpServer())
      .delete(`/admin/courses/${courseId}/chapters/${reuse.body.id}`)
      .set('Cookie', cookie);
    expect([200, 204]).toContain(removed.status);

    const detail = await request(app.getHttpServer())
      .get(`/admin/courses/${courseId}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.chapters).toHaveLength(1);
    expect(detail.body.chapters[0].id).toBe(added.body.id);
    expect(detail.body.chapters[0].title).toBe('Novel renamed');
    expect(detail.body.chapters[0].position).toBe(1);
  });

  it('returns 404 COURSE_NOT_FOUND for an unknown course', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .get('/admin/courses/does-not-exist')
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });
});
