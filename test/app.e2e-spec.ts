import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { CurrentUser } from './../src/auth/decorators/current-user.decorator';
import { Roles } from './../src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from './../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from './../src/auth/guards/roles.guard';
import { AuthenticatedUser } from './../src/auth/interfaces/authenticated-user.interface';
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

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
}

interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

@Controller('auth-probe')
class AuthProbeController {
  @Get()
  @UseGuards(JwtAuthGuard)
  getAuthenticatedUser(
    @CurrentUser() user: AuthenticatedUser,
  ): AuthenticatedUser {
    return user;
  }

  @Get('organizer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  getOrganizerOnly(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('attendee')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ATTENDEE)
  getAttendeeOnly(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: InMemoryUserRepository;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthProbeController],
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

  describe('POST /login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/register').send({
        name: 'Login User',
        email: 'login@example.com',
        password: 'Password123!',
        role: UserRole.ATTENDEE,
      });
    });

    it('logs in with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/login')
        .send({
          email: 'LOGIN@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const body = response.body as LoginResponseBody;

      expect(body).toEqual({
        accessToken: expect.any(String) as string,
        user: {
          id: expect.any(String) as string,
          name: 'Login User',
          email: 'login@example.com',
          role: UserRole.ATTENDEE,
        },
      });
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(body.accessToken).not.toContain('Password123!');
    });

    it('rejects an incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        path: '/login',
      });
    });

    it('rejects an unknown email', async () => {
      const response = await request(app.getHttpServer())
        .post('/login')
        .send({
          email: 'missing@example.com',
          password: 'Password123!',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        path: '/login',
      });
    });

    it('rejects invalid login input', async () => {
      const response = await request(app.getHttpServer())
        .post('/login')
        .send({
          email: 'not-an-email',
          password: '',
          unexpected: true,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        path: '/login',
      });
    });
  });

  describe('JWT authentication', () => {
    it('allows a valid bearer token', async () => {
      await request(app.getHttpServer()).post('/register').send({
        name: 'Token User',
        email: 'token@example.com',
        password: 'Password123!',
        role: UserRole.ORGANIZER,
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/login')
        .send({
          email: 'token@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const loginBody = loginResponse.body as LoginResponseBody;

      const response = await request(app.getHttpServer())
        .get('/auth-probe')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: loginBody.user.id,
        role: UserRole.ORGANIZER,
      });
    });

    it('rejects a missing JWT', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth-probe')
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        path: '/auth-probe',
      });
    });

    it('rejects an invalid JWT', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth-probe')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        path: '/auth-probe',
      });
    });
  });

  describe('role-based authorization', () => {
    it('allows an organizer to access organizer-only resources', async () => {
      const accessToken = await registerAndLogin({
        name: 'Organizer User',
        email: 'organizer-role@example.com',
        role: UserRole.ORGANIZER,
      });

      await request(app.getHttpServer())
        .get('/auth-probe/organizer')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect({ status: 'ok' });
    });

    it('allows an attendee to access attendee-only resources', async () => {
      const accessToken = await registerAndLogin({
        name: 'Attendee User',
        email: 'attendee-role@example.com',
        role: UserRole.ATTENDEE,
      });

      await request(app.getHttpServer())
        .get('/auth-probe/attendee')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect({ status: 'ok' });
    });

    it('rejects an attendee from organizer-only resources', async () => {
      const accessToken = await registerAndLogin({
        name: 'Blocked Attendee',
        email: 'blocked-attendee@example.com',
        role: UserRole.ATTENDEE,
      });

      const response = await request(app.getHttpServer())
        .get('/auth-probe/organizer')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ROLE',
        message: 'You do not have permission to access this resource',
        path: '/auth-probe/organizer',
      });
    });

    it('rejects an organizer from attendee-only resources', async () => {
      const accessToken = await registerAndLogin({
        name: 'Blocked Organizer',
        email: 'blocked-organizer@example.com',
        role: UserRole.ORGANIZER,
      });

      const response = await request(app.getHttpServer())
        .get('/auth-probe/attendee')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ROLE',
        message: 'You do not have permission to access this resource',
        path: '/auth-probe/attendee',
      });
    });

    it('rejects unauthenticated role-protected requests with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth-probe/organizer')
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        path: '/auth-probe/organizer',
      });
    });
  });

  async function registerAndLogin(input: {
    name: string;
    email: string;
    role: UserRole;
  }): Promise<string> {
    await request(app.getHttpServer()).post('/register').send({
      name: input.name,
      email: input.email,
      password: 'Password123!',
      role: input.role,
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/login')
      .send({
        email: input.email,
        password: 'Password123!',
      })
      .expect(200);

    const loginBody = loginResponse.body as LoginResponseBody;

    return loginBody.accessToken;
  }

  afterEach(async () => {
    await app.close();
  });
});
