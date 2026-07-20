import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toEqual({
          status: 'ok',
          service: 'virtual-event-management-platform',
          timestamp: expect.any(String) as string,
        });
      });
  });

  it('returns consistent error responses', () => {
    return request(app.getHttpServer())
      .get('/missing-route')
      .expect(404)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toEqual({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Cannot GET /missing-route',
          path: '/missing-route',
          timestamp: expect.any(String) as string,
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
