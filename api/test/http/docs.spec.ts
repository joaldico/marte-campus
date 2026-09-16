import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { setupSwagger } from '../../src/swagger';

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

  it('GET /docs-json returns 200 OpenAPI for health, auth, catalog, player, videos, playback and admin CRUD', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.paths['/health']).toBeDefined();
    expect(response.body.paths['/auth/users']).toBeDefined();
    expect(response.body.paths['/auth/login']).toBeDefined();
    expect(response.body.paths['/auth/me']).toBeDefined();
    expect(response.body.paths['/auth/logout']).toBeDefined();
    expect(response.body.paths['/catalog/courses']).toBeDefined();
    expect(response.body.paths['/catalog/courses'].get).toBeDefined();
    expect(response.body.paths['/catalog/courses'].post).toBeUndefined();
    expect(response.body.paths['/catalog/courses/{id}']).toBeDefined();
    expect(response.body.paths['/catalog/courses/{id}'].get).toBeDefined();
    expect(response.body.paths['/catalog/courses/{id}'].post).toBeUndefined();
    expect(response.body.paths['/catalog/courses/{id}/enroll']).toBeDefined();
    expect(response.body.paths['/catalog/courses/{id}/enroll'].post).toBeDefined();
    expect(response.body.paths['/player/chapters/{chapterId}']).toBeDefined();
    expect(response.body.paths['/player/chapters/{chapterId}'].get).toBeDefined();
    expect(response.body.paths['/player/chapters/{chapterId}'].post).toBeUndefined();
    expect(response.body.paths['/videos/{id}/stream']).toBeDefined();
    expect(response.body.paths['/videos/{id}/stream'].get).toBeDefined();
    expect(response.body.paths['/playback/events']).toBeDefined();
    expect(response.body.paths['/playback/events'].post).toBeDefined();
    expect(response.body.paths['/playback/cursor']).toBeDefined();
    expect(response.body.paths['/playback/cursor'].patch).toBeDefined();
    expect(response.body.paths['/admin/courses']).toBeDefined();
    expect(response.body.paths['/admin/courses'].get).toBeDefined();
    expect(response.body.paths['/admin/courses'].post).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}'].get).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}'].patch).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters'].post).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters/order']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters/order'].patch).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters/{cid}']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters/{cid}'].patch).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/chapters/{cid}'].delete).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/transition']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/transition'].post).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/revisions/submit']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/revisions/submit'].post).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/revisions/publish']).toBeDefined();
    expect(response.body.paths['/admin/courses/{id}/revisions/publish'].post).toBeDefined();
    expect(response.body.paths['/admin/events/import']).toBeDefined();
    expect(response.body.paths['/admin/events/import'].post).toBeDefined();
    expect(response.body.paths['/admin/videos/{id}/heatmap']).toBeUndefined();
  });

  it('GET /docs returns 200 Swagger UI', async () => {
    const response = await request(app.getHttpServer()).get('/docs');

    expect(response.status).toBe(200);
    expect(String(response.text)).toMatch(/swagger/i);
  });
});
