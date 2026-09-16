import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
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
  const enrollments = SEED_ENROLLMENTS.map((row) => ({
    id: `enroll-${row.userId}-${row.courseId}`,
    userId: row.userId,
    courseId: row.courseId,
  }));
  const events = buildSeedPlaybackRecords();

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
    const enrollmentsArg = include?.enrollments as
      | boolean
      | { where?: { userId?: string } }
      | undefined;
    if (enrollmentsArg) {
      const userId =
        enrollmentsArg === true ? undefined : enrollmentsArg.where?.userId;
      row.enrollments = enrollments.filter((item) => {
        if (item.courseId !== course.id) {
          return false;
        }
        if (userId && item.userId !== userId) {
          return false;
        }
        return true;
      });
    }
    return row;
  };

  const prisma: Record<string, unknown> & { failPublishedPointerOnce?: boolean } =
    {};
  prisma.failPublishedPointerOnce = false;

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
        if (
          prisma.failPublishedPointerOnce &&
          args.data.publishedVersionId != null &&
          args.data.status === undefined
        ) {
          prisma.failPublishedPointerOnce = false;
          throw new Error('simulated publishedVersionId failure');
        }
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
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<VersionRow>;
        include?: Record<string, unknown>;
      }) => {
        const version = versions.find((row) => row.id === args.where.id);
        if (!version) {
          return null;
        }
        Object.assign(version, args.data);
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
  prisma.enrollment = {
    findMany: jest.fn(
      async (args: { where?: { userId?: string; courseId?: string } } = {}) => {
        return enrollments.filter((row) => {
          if (args.where?.userId && row.userId !== args.where.userId) {
            return false;
          }
          if (args.where?.courseId && row.courseId !== args.where.courseId) {
            return false;
          }
          return true;
        });
      },
    ),
  };
  prisma.playbackEvent = {
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
          const videoFilter = args.where?.videoId;
          if (videoFilter == null) {
            return true;
          }
          if (typeof videoFilter === 'string') {
            return row.videoId === videoFilter;
          }
          if (
            typeof videoFilter === 'object' &&
            videoFilter !== null &&
            'in' in videoFilter
          ) {
            return (videoFilter as { in: string[] }).in.includes(row.videoId);
          }
          return true;
        });
      },
    ),
  };
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      const snapshot = {
        courses: courses.map((row) => ({ ...row })),
        versions: versions.map((row) => ({ ...row })),
        chapters: chapters.map((row) => ({ ...row })),
        videos: videos.map((row) => ({ ...row })),
      };
      try {
        return await (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      } catch (err) {
        courses.splice(0, courses.length, ...snapshot.courses);
        versions.splice(0, versions.length, ...snapshot.versions);
        chapters.splice(0, chapters.length, ...snapshot.chapters);
        videos.splice(0, videos.length, ...snapshot.videos);
        throw err;
      }
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });

  return prisma;
}

describe('Admin courses HTTP (T-6.1 / T-6.3 / CA-05 / CA-07)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof seedPrisma>;

  beforeEach(async () => {
    prisma = seedPrisma();
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

  it('CA-07: Ana PATCH Paisajes I chapter 2 clones working; Bruno sees new title only after submit+publish; playa uniqueSeconds stays 10', async () => {
    const ana = await loginAs('ana');
    const bruno = await loginAs('bruno');

    const before = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', bruno);
    expect(before.status).toBe(200);
    expect(before.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Playa',
      'Cascada',
      'Bosque',
    ]);
    const playaBefore = before.body.chapters.find(
      (chapter: { videoId: string }) => chapter.videoId === 'playa',
    );
    const cascadaBefore = before.body.chapters.find(
      (chapter: { videoId: string }) => chapter.videoId === 'cascada',
    );
    expect(playaBefore.chapterProgress.uniqueSeconds).toBe(10);
    expect(cascadaBefore.chapterProgress.uniqueSeconds).toBe(10);

    const patched = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', ana)
      .send({ title: 'Cascada editada' });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe('Cascada editada');
    expect(patched.body.id).not.toBe('paisajes-i-ch-2');

    const adminAfterClone = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', ana);
    expect(adminAfterClone.status).toBe(200);
    expect(adminAfterClone.body.status).toBe('published');
    expect(adminAfterClone.body.publishedVersionId).toBe('paisajes-i-v1');
    expect(adminAfterClone.body.workingVersionId).not.toBe(
      adminAfterClone.body.publishedVersionId,
    );
    expect(adminAfterClone.body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'paisajes-i-v1',
          revisionStatus: 'published',
          versionNumber: 1,
        }),
        expect.objectContaining({
          id: adminAfterClone.body.workingVersionId,
          revisionStatus: 'draft',
          versionNumber: 2,
        }),
      ]),
    );
    expect(
      adminAfterClone.body.chapters.map((chapter: { title: string }) => chapter.title),
    ).toEqual(['Playa', 'Cascada editada', 'Bosque']);

    const brunoDuringDraft = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', bruno);
    expect(brunoDuringDraft.status).toBe(200);
    expect(
      brunoDuringDraft.body.chapters.map((chapter: { title: string }) => chapter.title),
    ).toEqual(['Playa', 'Cascada', 'Bosque']);
    const playaDraft = brunoDuringDraft.body.chapters.find(
      (chapter: { videoId: string }) => chapter.videoId === 'playa',
    );
    expect(playaDraft.chapterProgress.uniqueSeconds).toBe(10);
    expect(playaDraft.ranges).toEqual(playaBefore.ranges);

    const submitted = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', ana);
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('published');
    expect(submitted.body.workingVersionId).toBe(adminAfterClone.body.workingVersionId);
    expect(submitted.body.publishedVersionId).toBe('paisajes-i-v1');

    const afterSubmit = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', ana);
    expect(afterSubmit.status).toBe(200);
    expect(afterSubmit.body.status).toBe('published');
    expect(afterSubmit.body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: afterSubmit.body.workingVersionId,
          revisionStatus: 'in_review',
        }),
      ]),
    );

    const published = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/publish')
      .set('Cookie', ana);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');
    expect(published.body.publishedVersionId).toBe(published.body.workingVersionId);
    expect(published.body.workingVersionId).toBe(adminAfterClone.body.workingVersionId);

    const brunoAfter = await request(app.getHttpServer())
      .get('/catalog/courses/paisajes-i')
      .set('Cookie', bruno);
    expect(brunoAfter.status).toBe(200);
    expect(brunoAfter.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Playa',
      'Cascada editada',
      'Bosque',
    ]);
    const playaAfter = brunoAfter.body.chapters.find(
      (chapter: { videoId: string }) => chapter.videoId === 'playa',
    );
    const cascadaAfter = brunoAfter.body.chapters.find(
      (chapter: { videoId: string }) => chapter.videoId === 'cascada',
    );
    expect(playaAfter.chapterProgress.uniqueSeconds).toBe(10);
    expect(cascadaAfter.chapterProgress.uniqueSeconds).toBe(10);
    expect(playaAfter.ranges).toEqual(playaBefore.ranges);
    expect(cascadaAfter.chapterProgress.ratio).toBeCloseTo(
      cascadaBefore.chapterProgress.ratio,
    );
  });

  it('clones published working version on POST chapter when working === published', async () => {
    const cookie = await loginAs('ana');
    const playa = VIDEO_DURATIONS.find((video) => video.id === 'playa');
    if (!playa) {
      throw new Error('seed playa missing');
    }

    const add = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/chapters')
      .set('Cookie', cookie)
      .send({ title: 'Extra', url: playa.url });
    expect(add.status).toBe(201);
    expect(add.body.title).toBe('Extra');
    expect(add.body.position).toBe(4);

    const afterAdd = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(afterAdd.status).toBe(200);
    expect(afterAdd.body.publishedVersionId).toBe('paisajes-i-v1');
    expect(afterAdd.body.workingVersionId).not.toBe(afterAdd.body.publishedVersionId);
    expect(afterAdd.body.chapters).toHaveLength(4);
    expect(afterAdd.body.chapters.map((chapter: { id: string }) => chapter.id)).not.toEqual(
      expect.arrayContaining(['paisajes-i-ch-1', 'paisajes-i-ch-2', 'paisajes-i-ch-3']),
    );
  });

  it('clones published working version when reordering Paisajes I chapters', async () => {
    const cookie = await loginAs('ana');
    const order = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/order')
      .set('Cookie', cookie)
      .send({
        chapterIds: ['paisajes-i-ch-3', 'paisajes-i-ch-1', 'paisajes-i-ch-2'],
      });
    expect(order.status).toBe(200);
    expect(order.body.publishedVersionId).toBe('paisajes-i-v1');
    expect(order.body.workingVersionId).not.toBe(order.body.publishedVersionId);
    expect(order.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Bosque',
      'Playa',
      'Cascada',
    ]);
    expect(order.body.chapters.map((chapter: { id: string }) => chapter.id)).not.toContain(
      'paisajes-i-ch-1',
    );
  });

  it('clones published working version when deleting a Paisajes I chapter', async () => {
    const cookie = await loginAs('ana');
    const del = await request(app.getHttpServer())
      .delete('/admin/courses/paisajes-i/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);
    expect([200, 204]).toContain(del.status);

    const detail = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.publishedVersionId).toBe('paisajes-i-v1');
    expect(detail.body.workingVersionId).not.toBe(detail.body.publishedVersionId);
    expect(detail.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Cascada',
      'Bosque',
    ]);
  });

  it('mutates working only once a distinct clone exists; 409 CHAPTER_ON_PUBLISHED for published-by-id', async () => {
    const cookie = await loginAs('ana');

    const first = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie)
      .send({ title: 'Cascada editada' });
    expect(first.status).toBe(200);
    const workingChapterId = first.body.id as string;

    const detail = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    const workingVersionId = detail.body.workingVersionId as string;
    expect(detail.body.versions).toHaveLength(2);

    const second = await request(app.getHttpServer())
      .patch(`/admin/courses/paisajes-i/chapters/${workingChapterId}`)
      .set('Cookie', cookie)
      .send({ title: 'Cascada v2' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(workingChapterId);
    expect(second.body.title).toBe('Cascada v2');

    const afterSecond = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(afterSecond.status).toBe(200);
    expect(afterSecond.body.workingVersionId).toBe(workingVersionId);
    expect(afterSecond.body.versions).toHaveLength(2);

    const publishedById = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie)
      .send({ title: 'should not land' });
    expect(publishedById.status).toBe(409);
    expect(publishedById.body.code).toBe('CHAPTER_ON_PUBLISHED');

    const deletePublished = await request(app.getHttpServer())
      .delete('/admin/courses/paisajes-i/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);
    expect(deletePublished.status).toBe(409);
    expect(deletePublished.body.code).toBe('CHAPTER_ON_PUBLISHED');
  });

  it('does not leave a draft clone after a 404 chapter PATCH; retry with published id clones', async () => {
    const cookie = await loginAs('ana');

    const missing = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/does-not-exist')
      .set('Cookie', cookie)
      .send({ title: 'nope' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CHAPTER_NOT_FOUND');

    const afterFail = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(afterFail.status).toBe(200);
    expect(afterFail.body.workingVersionId).toBe(afterFail.body.publishedVersionId);
    expect(afterFail.body.versions).toHaveLength(1);

    const patched = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie)
      .send({ title: 'Cascada editada' });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe('Cascada editada');
    expect(patched.body.id).not.toBe('paisajes-i-ch-2');
  });

  it('does not leave a draft clone after CHAPTER_SET_MISMATCH; retry with published ids clones', async () => {
    const cookie = await loginAs('ana');

    const mismatch = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/order')
      .set('Cookie', cookie)
      .send({ chapterIds: ['paisajes-i-ch-1'] });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('CHAPTER_SET_MISMATCH');

    const afterFail = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(afterFail.status).toBe(200);
    expect(afterFail.body.workingVersionId).toBe(afterFail.body.publishedVersionId);
    expect(afterFail.body.versions).toHaveLength(1);

    const order = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/order')
      .set('Cookie', cookie)
      .send({
        chapterIds: ['paisajes-i-ch-3', 'paisajes-i-ch-1', 'paisajes-i-ch-2'],
      });
    expect(order.status).toBe(200);
    expect(order.body.workingVersionId).not.toBe(order.body.publishedVersionId);
    expect(order.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Bosque',
      'Playa',
      'Cascada',
    ]);
  });

  it('does not leave a draft clone after a 404 chapter DELETE; retry with published id clones', async () => {
    const cookie = await loginAs('ana');

    const missing = await request(app.getHttpServer())
      .delete('/admin/courses/paisajes-i/chapters/does-not-exist')
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CHAPTER_NOT_FOUND');

    const afterFail = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(afterFail.status).toBe(200);
    expect(afterFail.body.workingVersionId).toBe(afterFail.body.publishedVersionId);
    expect(afterFail.body.versions).toHaveLength(1);

    const del = await request(app.getHttpServer())
      .delete('/admin/courses/paisajes-i/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);
    expect([200, 204]).toContain(del.status);

    const detail = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.workingVersionId).not.toBe(detail.body.publishedVersionId);
    expect(detail.body.chapters.map((chapter: { title: string }) => chapter.title)).toEqual([
      'Cascada',
      'Bosque',
    ]);
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

  it('returns 401 without a session cookie on POST transition', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-iii/transition')
      .send({ to: 'in_review' });
    expect(response.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when Bruno POSTs a course transition', async () => {
    const cookie = await loginAs('bruno');
    const response = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-iii/transition')
      .set('Cookie', cookie)
      .send({ to: 'in_review' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
    expect(response.body.message).toBeTruthy();
  });

  it('CA-06: Paisajes III draft→published 409, in_review 200, then empty publish 409', async () => {
    const cookie = await loginAs('ana');

    const skipReview = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-iii/transition')
      .set('Cookie', cookie)
      .send({ to: 'published' });
    expect(skipReview.status).toBe(409);
    expect(skipReview.body.code).toBe('STATE_TRANSITION_FORBIDDEN');
    expect(skipReview.body.message).toBeTruthy();

    const toReview = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-iii/transition')
      .set('Cookie', cookie)
      .send({ to: 'in_review' });
    expect(toReview.status).toBe(200);
    expect(toReview.body.status).toBe('in_review');

    const afterReview = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-iii')
      .set('Cookie', cookie);
    expect(afterReview.status).toBe(200);
    expect(afterReview.body.status).toBe('in_review');
    expect(afterReview.body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: afterReview.body.workingVersionId,
          revisionStatus: 'in_review',
        }),
      ]),
    );

    const emptyPublish = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-iii/transition')
      .set('Cookie', cookie)
      .send({ to: 'published' });
    expect(emptyPublish.status).toBe(409);
    expect(emptyPublish.body.code).toBe('COURSE_EMPTY');
    expect(emptyPublish.body.message).toBeTruthy();
    expect(emptyPublish.body.status).not.toBe('published');
  });

  it('CA-06: Paisajes I published→draft 409, retired 200 keeps version pointers', async () => {
    const cookie = await loginAs('ana');

    const before = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.status).toBe('published');
    const workingVersionId = before.body.workingVersionId as string;
    const publishedVersionId = before.body.publishedVersionId as string;
    expect(workingVersionId).toBeTruthy();
    expect(publishedVersionId).toBe(workingVersionId);

    const backToDraft = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/transition')
      .set('Cookie', cookie)
      .send({ to: 'draft' });
    expect(backToDraft.status).toBe(409);
    expect(backToDraft.body.code).toBe('STATE_TRANSITION_FORBIDDEN');
    expect(backToDraft.body.message).toBeTruthy();

    const retire = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/transition')
      .set('Cookie', cookie)
      .send({ to: 'retired' });
    expect(retire.status).toBe(200);
    expect(retire.body.status).toBe('retired');
    expect(retire.body.workingVersionId).toBe(workingVersionId);
    expect(retire.body.publishedVersionId).toBe(publishedVersionId);

    const after = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.status).toBe('retired');
    expect(after.body.workingVersionId).toBe(workingVersionId);
    expect(after.body.publishedVersionId).toBe(publishedVersionId);
  });

  it('publishes Paisajes II in_review with chapters onto the working version', async () => {
    const cookie = await loginAs('ana');

    const before = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-ii')
      .set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.status).toBe('in_review');
    expect(before.body.publishedVersionId).toBeNull();
    expect(before.body.chapters.length).toBeGreaterThanOrEqual(1);

    const published = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-ii/transition')
      .set('Cookie', cookie)
      .send({ to: 'published' });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');
    expect(published.body.workingVersionId).toBe(before.body.workingVersionId);
    expect(published.body.publishedVersionId).toBe(before.body.workingVersionId);

    const after = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-ii')
      .set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.status).toBe('published');
    expect(after.body.publishedVersionId).toBe(after.body.workingVersionId);
    expect(after.body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: after.body.workingVersionId,
          revisionStatus: 'published',
        }),
      ]),
    );
  });

  it('returns 404 COURSE_NOT_FOUND when transitioning an unknown course', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .post('/admin/courses/does-not-exist/transition')
      .set('Cookie', cookie)
      .send({ to: 'in_review' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('returns 401 without a session cookie on revision submit/publish', async () => {
    const submit = await request(app.getHttpServer()).post(
      '/admin/courses/paisajes-i/revisions/submit',
    );
    expect(submit.status).toBe(401);

    const publish = await request(app.getHttpServer()).post(
      '/admin/courses/paisajes-i/revisions/publish',
    );
    expect(publish.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when Bruno submits or publishes a revision', async () => {
    const cookie = await loginAs('bruno');

    const submit = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', cookie);
    expect(submit.status).toBe(403);
    expect(submit.body.code).toBe('FORBIDDEN');

    const publish = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/publish')
      .set('Cookie', cookie);
    expect(publish.status).toBe(403);
    expect(publish.body.code).toBe('FORBIDDEN');
  });

  it('returns 409 STATE_TRANSITION_FORBIDDEN when submitting with working === published', async () => {
    const cookie = await loginAs('ana');
    const response = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('STATE_TRANSITION_FORBIDDEN');
    expect(response.body.message).toBeTruthy();
  });

  it('returns 409 STATE_TRANSITION_FORBIDDEN when publishing a draft revision', async () => {
    const cookie = await loginAs('ana');
    const patched = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie)
      .send({ title: 'Cascada editada' });
    expect(patched.status).toBe(200);

    const response = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/publish')
      .set('Cookie', cookie);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('STATE_TRANSITION_FORBIDDEN');
    expect(response.body.message).toBeTruthy();
  });

  it('returns 409 STATE_TRANSITION_FORBIDDEN when submitting a revision that is not draft', async () => {
    const cookie = await loginAs('ana');
    const patched = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie)
      .send({ title: 'Cascada editada' });
    expect(patched.status).toBe(200);

    const first = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', cookie);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', cookie);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('STATE_TRANSITION_FORBIDDEN');
  });

  it('returns 409 COURSE_EMPTY when publishing an in_review revision with 0 chapters', async () => {
    const cookie = await loginAs('ana');
    const del1 = await request(app.getHttpServer())
      .delete('/admin/courses/paisajes-i/chapters/paisajes-i-ch-1')
      .set('Cookie', cookie);
    expect([200, 204]).toContain(del1.status);

    const afterClone = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(afterClone.status).toBe(200);
    const workingIds = afterClone.body.chapters.map(
      (chapter: { id: string }) => chapter.id,
    ) as string[];
    for (const chapterId of workingIds) {
      const removed = await request(app.getHttpServer())
        .delete(`/admin/courses/paisajes-i/chapters/${chapterId}`)
        .set('Cookie', cookie);
      expect([200, 204]).toContain(removed.status);
    }

    const submitted = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', cookie);
    expect(submitted.status).toBe(200);

    const emptyPublish = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/publish')
      .set('Cookie', cookie);
    expect(emptyPublish.status).toBe(409);
    expect(emptyPublish.body.code).toBe('COURSE_EMPTY');
    expect(emptyPublish.body.message).toBeTruthy();
    expect(emptyPublish.body.publishedVersionId).not.toBe(
      afterClone.body.workingVersionId,
    );
  });

  it('returns 404 COURSE_NOT_FOUND for revision submit/publish on an unknown course', async () => {
    const cookie = await loginAs('ana');
    const submit = await request(app.getHttpServer())
      .post('/admin/courses/does-not-exist/revisions/submit')
      .set('Cookie', cookie);
    expect(submit.status).toBe(404);
    expect(submit.body.code).toBe('COURSE_NOT_FOUND');

    const publish = await request(app.getHttpServer())
      .post('/admin/courses/does-not-exist/revisions/publish')
      .set('Cookie', cookie);
    expect(publish.status).toBe(404);
    expect(publish.body.code).toBe('COURSE_NOT_FOUND');
  });

  it('keeps working in_review and published pointer unchanged if publish pointer write fails', async () => {
    const cookie = await loginAs('ana');
    const patched = await request(app.getHttpServer())
      .patch('/admin/courses/paisajes-i/chapters/paisajes-i-ch-2')
      .set('Cookie', cookie)
      .send({ title: 'Cascada editada' });
    expect(patched.status).toBe(200);

    const submitted = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/submit')
      .set('Cookie', cookie);
    expect(submitted.status).toBe(200);

    const before = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(before.status).toBe(200);
    const workingVersionId = before.body.workingVersionId as string;
    expect(before.body.publishedVersionId).toBe('paisajes-i-v1');

    prisma.failPublishedPointerOnce = true;
    const published = await request(app.getHttpServer())
      .post('/admin/courses/paisajes-i/revisions/publish')
      .set('Cookie', cookie);
    expect(published.status).toBeGreaterThanOrEqual(500);

    const after = await request(app.getHttpServer())
      .get('/admin/courses/paisajes-i')
      .set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.publishedVersionId).toBe('paisajes-i-v1');
    expect(after.body.workingVersionId).toBe(workingVersionId);
    expect(after.body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: workingVersionId,
          revisionStatus: 'in_review',
        }),
      ]),
    );
  });
});
