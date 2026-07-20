import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from './../src/common/enums/user-role.enum';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { InMemoryUserRepository } from './../src/users/repositories/in-memory-user.repository';
import { USER_REPOSITORY } from './../src/users/repositories/user.repository.interface';

interface RegisterResponseBody {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: InMemoryUserRepository;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    userRepository = app.get<InMemoryUserRepository>(USER_REPOSITORY);
    userRepository.clear();
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

  describe('POST /register', () => {
    it('registers an organizer without returning password data', async () => {
      const response = await request(app.getHttpServer())
        .post('/register')
        .send({
          name: 'Event Organizer',
          email: 'organizer@example.com',
          password: 'Password123!',
          role: UserRole.ORGANIZER,
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String) as string,
        name: 'Event Organizer',
        email: 'organizer@example.com',
        role: UserRole.ORGANIZER,
        createdAt: expect.any(String) as string,
      });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('registers an attendee and stores a password hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/register')
        .send({
          name: 'Event Attendee',
          email: 'attendee@example.com',
          password: 'Password123!',
          role: UserRole.ATTENDEE,
        })
        .expect(201);

      const body = response.body as RegisterResponseBody;
      const storedUser = await userRepository.findById(body.id);

      expect(storedUser).not.toBeNull();
      expect(storedUser?.passwordHash).not.toBe('Password123!');
      await expect(
        bcrypt.compare('Password123!', storedUser?.passwordHash ?? ''),
      ).resolves.toBe(true);
    });

    it('rejects duplicate emails case-insensitively', async () => {
      await request(app.getHttpServer()).post('/register').send({
        name: 'First User',
        email: 'User@example.com',
        password: 'Password123!',
        role: UserRole.ATTENDEE,
      });

      const response = await request(app.getHttpServer())
        .post('/register')
        .send({
          name: 'Second User',
          email: 'user@example.com',
          password: 'Password123!',
          role: UserRole.ATTENDEE,
        })
        .expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'USER_EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists',
        path: '/register',
      });
    });

    it('rejects invalid registration input and unknown properties', async () => {
      const response = await request(app.getHttpServer())
        .post('/register')
        .send({
          name: '',
          email: 'not-an-email',
          password: 'short',
          role: 'speaker',
          unexpected: true,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        path: '/register',
      });
      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(
        expect.arrayContaining([
          'property unexpected should not exist',
          'name must be longer than or equal to 2 characters',
          'email must be an email',
          'password must be longer than or equal to 8 characters',
          'role must be one of the following values: organizer, attendee',
        ]),
      );
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
