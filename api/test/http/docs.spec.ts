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

  it('GET /docs-json returns 200 OpenAPI for health, auth, catalog list, enroll and course detail (no admin)', async () => {
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
    expect(response.body.paths['/admin/courses']).toBeUndefined();
  });

  it('GET /docs returns 200 Swagger UI', async () => {
    const response = await request(app.getHttpServer()).get('/docs');

    expect(response.status).toBe(200);
    expect(String(response.text)).toMatch(/swagger/i);
  });
});
