import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SESSION_COOKIE } from '../../src/auth/session-cookie';
import { PrismaService } from '../../src/prisma/prisma.service';
import { setupSwagger } from '../../src/swagger';

/** Spec 2.8 method+path map (Nest, no `/api` prefix). OpenAPI params use `{id}`. */
const SPEC_28_OPERATIONS = [
  'GET /health',
  'GET /auth/users',
  'POST /auth/login',
  'POST /auth/logout',
  'GET /auth/me',
  'GET /catalog/courses',
  'POST /catalog/courses/{id}/enroll',
  'GET /catalog/courses/{id}',
  'GET /player/chapters/{chapterId}',
  'POST /playback/events',
  'PATCH /playback/cursor',
  'GET /videos/{id}/stream',
  'GET /admin/courses',
  'POST /admin/courses',
  'GET /admin/courses/{id}',
  'PATCH /admin/courses/{id}',
  'POST /admin/courses/{id}/transition',
  'POST /admin/courses/{id}/chapters',
  'PATCH /admin/courses/{id}/chapters/order',
  'PATCH /admin/courses/{id}/chapters/{cid}',
  'DELETE /admin/courses/{id}/chapters/{cid}',
  'POST /admin/courses/{id}/revisions/submit',
  'POST /admin/courses/{id}/revisions/publish',
  'POST /admin/events/import',
  'GET /admin/videos/{id}/heatmap',
] as const;

const PUBLIC_OPERATIONS = new Set<string>([
  'GET /health',
  'GET /auth/users',
  'POST /auth/login',
]);

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

type OpenApiDoc = {
  openapi?: string;
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    securitySchemes?: Record<
      string,
      { type?: string; in?: string; name?: string }
    >;
  };
};

type OpenApiOperation = {
  security?: Array<Record<string, unknown>>;
};

function listedOperations(paths: Record<string, Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const path of Object.keys(paths).sort()) {
    const item = paths[path] ?? {};
    for (const method of HTTP_METHODS) {
      if (item[method]) {
        out.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return out;
}

function cookieSchemeName(doc: OpenApiDoc): string {
  const schemes = doc.components?.securitySchemes ?? {};
  const found = Object.entries(schemes).find(
    ([, scheme]) =>
      scheme.type === 'apiKey' &&
      scheme.in === 'cookie' &&
      scheme.name === SESSION_COOKIE,
  );
  expect(found).toBeDefined();
  return found![0];
}

function operationAt(
  paths: Record<string, Record<string, unknown>>,
  listed: string,
): OpenApiOperation {
  const space = listed.indexOf(' ');
  const method = listed.slice(0, space).toLowerCase();
  const path = listed.slice(space + 1);
  return paths[path]?.[method] as OpenApiOperation;
}

describe('Swagger /docs', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /docs-json lists every spec 2.8 method+path and no extra operations', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');
    const doc = response.body as OpenApiDoc;
    const paths = doc.paths ?? {};

    expect(response.status).toBe(200);
    expect(doc.openapi).toMatch(/^3\./);
    expect(listedOperations(paths).sort()).toEqual([...SPEC_28_OPERATIONS].sort());
  });

  it('documents cookie session auth on every spec 2.8 authed operation', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');
    const doc = response.body as OpenApiDoc;
    const paths = doc.paths ?? {};
    const scheme = cookieSchemeName(doc);

    for (const listed of SPEC_28_OPERATIONS) {
      const op = operationAt(paths, listed);
      const names = (op?.security ?? []).flatMap((entry) => Object.keys(entry));
      if (PUBLIC_OPERATIONS.has(listed)) {
        expect(names).not.toContain(scheme);
      } else {
        expect(names).toContain(scheme);
      }
    }
  });

  it('GET /docs returns 200 Swagger UI', async () => {
    const response = await request(app.getHttpServer()).get('/docs');

    expect(response.status).toBe(200);
    expect(String(response.text)).toMatch(/swagger/i);
  });
});
