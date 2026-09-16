import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SESSION_COOKIE } from './auth/session-cookie';

/**
 * Nest serves Swagger at GET /docs (JSON at /docs-json).
 * nginx `location /api/` + `proxy_pass http://api:3000/` strips `/api`,
 * so the browser path is GET /api/docs.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Campus Marte')
    .setDescription(
      'OpenAPI generated from Nest decorators (health, auth, catalog, player chapter, video stream, playback events and cursor, admin course CRUD).',
    )
    .setVersion('1.0')
    .addServer('/api', 'nginx / Vite proxy')
    .addServer('/', 'Nest listen :3000')
    .addCookieAuth(SESSION_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Campus Marte API',
  });
}
