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
import type { Event } from './../src/events/domain/event';
import { InMemoryEventRepository } from './../src/events/repositories/in-memory-event.repository';
import { EVENT_REPOSITORY } from './../src/events/repositories/event.repository.interface';
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

interface EventResponseBody {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  organizerId: string;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

interface EventRegistrationResponseBody {
  message: string;
  event: EventResponseBody;
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
  let eventRepository: InMemoryEventRepository;
  let userRepository: InMemoryUserRepository;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    eventRepository = app.get<InMemoryEventRepository>(EVENT_REPOSITORY);
    userRepository = app.get<InMemoryUserRepository>(USER_REPOSITORY);
    eventRepository.clear();
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

  describe('events', () => {
    it('allows an organizer to create an event', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Event Organizer',
        email: 'event-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const scheduledAt = futureIsoDate();

      const response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'NestJS Summit',
          description: 'A virtual event about NestJS',
          scheduledAt,
        })
        .expect(201);

      const body = response.body as EventResponseBody;

      expect(body).toEqual({
        id: expect.any(String) as string,
        title: 'NestJS Summit',
        description: 'A virtual event about NestJS',
        scheduledAt,
        organizerId: expect.any(String) as string,
        participantCount: 0,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
      expect(body).not.toHaveProperty('participantIds');
    });

    it('lists events publicly without participant IDs', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Public Organizer',
        email: 'public-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const body = response.body as EventResponseBody[];

      expect(body).toEqual([createdEvent]);
      expect(body[0]).not.toHaveProperty('participantIds');
    });

    it('retrieves an event by ID publicly', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Lookup Organizer',
        email: 'lookup-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}`)
        .expect(200);

      expect(response.body).toEqual(createdEvent);
    });

    it('returns 404 when an event does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9')
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
        path: '/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
      });
    });

    it('rejects invalid event IDs', async () => {
      const response = await request(app.getHttpServer())
        .get('/events/not-a-uuid')
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'BAD_REQUEST',
        path: '/events/not-a-uuid',
      });
    });

    it('rejects unauthenticated event creation', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Private Event',
          description: 'Should require auth',
          scheduledAt: futureIsoDate(),
        })
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        path: '/events',
      });
    });

    it('rejects attendee event creation', async () => {
      const attendeeToken = await registerAndLogin({
        name: 'Event Attendee',
        email: 'event-attendee@example.com',
        role: UserRole.ATTENDEE,
      });

      const response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          title: 'Attendee Event',
          description: 'Attendees cannot create events',
          scheduledAt: futureIsoDate(),
        })
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ROLE',
        path: '/events',
      });
    });

    it('rejects invalid event payloads and unknown properties', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Invalid Organizer',
        email: 'invalid-organizer@example.com',
        role: UserRole.ORGANIZER,
      });

      const response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: '',
          description: '',
          scheduledAt: 'not-a-date',
          extra: true,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        path: '/events',
      });

      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(
        expect.arrayContaining([
          'property extra should not exist',
          'title must be longer than or equal to 1 characters',
          'description must be longer than or equal to 1 characters',
          'scheduledAt must be a valid ISO 8601 date string',
        ]),
      );
    });

    it('rejects past events', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Past Organizer',
        email: 'past-organizer@example.com',
        role: UserRole.ORGANIZER,
      });

      const response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Past Event',
          description: 'This already happened',
          scheduledAt: new Date(Date.now() - 60 * 1000).toISOString(),
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'EVENT_SCHEDULE_MUST_BE_FUTURE',
        message: 'Event must be scheduled in the future',
        path: '/events',
      });
    });

    it('rejects client-supplied organizer and participant fields', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Immutable Organizer',
        email: 'immutable-organizer@example.com',
        role: UserRole.ORGANIZER,
      });

      const response = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Immutable Event',
          description: 'Clients cannot provide internal fields',
          scheduledAt: futureIsoDate(),
          organizerId: 'dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
          participantIds: ['dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9'],
        })
        .expect(400);

      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(
        expect.arrayContaining([
          'property organizerId should not exist',
          'property participantIds should not exist',
        ]),
      );
    });

    it('allows the event owner to update editable fields', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Update Organizer',
        email: 'update-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);
      const updatedSchedule = futureIsoDate(2);

      const response = await request(app.getHttpServer())
        .put(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Updated Event',
          scheduledAt: updatedSchedule,
        })
        .expect(200);

      const body = response.body as EventResponseBody;

      expect(body).toMatchObject({
        id: createdEvent.id,
        title: 'Updated Event',
        description: createdEvent.description,
        scheduledAt: updatedSchedule,
        organizerId: createdEvent.organizerId,
        participantCount: 0,
        createdAt: createdEvent.createdAt,
      });
      expect(Date.parse(body.updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(createdEvent.updatedAt),
      );
      expect(body).not.toHaveProperty('participantIds');
    });

    it('rejects event updates from a non-owner organizer', async () => {
      const ownerToken = await registerAndLogin({
        name: 'Owner Organizer',
        email: 'owner-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const otherOrganizerToken = await registerAndLogin({
        name: 'Other Organizer',
        email: 'other-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(ownerToken);

      const response = await request(app.getHttpServer())
        .put(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({
          title: 'Unauthorized Update',
        })
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'EVENT_OWNER_REQUIRED',
        message: 'Only the event organizer can modify this event',
        path: `/events/${createdEvent.id}`,
      });
    });

    it('rejects attendee event updates', async () => {
      const ownerToken = await registerAndLogin({
        name: 'Role Owner',
        email: 'role-owner@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'Update Attendee',
        email: 'update-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(ownerToken);

      const response = await request(app.getHttpServer())
        .put(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          title: 'Attendee Update',
        })
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ROLE',
        path: `/events/${createdEvent.id}`,
      });
    });

    it('returns 404 when updating a missing event', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Missing Update Organizer',
        email: 'missing-update-organizer@example.com',
        role: UserRole.ORGANIZER,
      });

      const response = await request(app.getHttpServer())
        .put('/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Missing update',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
        path: '/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
      });
    });

    it('rejects empty event updates', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Empty Update Organizer',
        email: 'empty-update-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .put(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'EVENT_UPDATE_EMPTY',
        message: 'At least one editable event field must be provided',
        path: `/events/${createdEvent.id}`,
      });
    });

    it('rejects immutable fields on event update', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Immutable Update Organizer',
        email: 'immutable-update-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .put(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Immutable Update',
          id: 'dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
          organizerId: 'dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
          participantIds: ['dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9'],
          createdAt: futureIsoDate(),
          updatedAt: futureIsoDate(),
        })
        .expect(400);

      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(
        expect.arrayContaining([
          'property id should not exist',
          'property organizerId should not exist',
          'property participantIds should not exist',
          'property createdAt should not exist',
          'property updatedAt should not exist',
        ]),
      );
    });

    it('rejects past event schedules on update', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Past Update Organizer',
        email: 'past-update-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .put(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          scheduledAt: new Date(Date.now() - 60 * 1000).toISOString(),
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'EVENT_SCHEDULE_MUST_BE_FUTURE',
        message: 'Event must be scheduled in the future',
        path: `/events/${createdEvent.id}`,
      });
    });

    it('allows the event owner to delete an event', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Delete Organizer',
        email: 'delete-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      await request(app.getHttpServer())
        .delete(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(204)
        .expect('');

      await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}`)
        .expect(404);
    });

    it('rejects event deletion from a non-owner organizer', async () => {
      const ownerToken = await registerAndLogin({
        name: 'Delete Owner',
        email: 'delete-owner@example.com',
        role: UserRole.ORGANIZER,
      });
      const otherOrganizerToken = await registerAndLogin({
        name: 'Delete Other',
        email: 'delete-other@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(ownerToken);

      const response = await request(app.getHttpServer())
        .delete(`/events/${createdEvent.id}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'EVENT_OWNER_REQUIRED',
        path: `/events/${createdEvent.id}`,
      });
    });

    it('returns 404 when deleting a missing event', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Missing Delete Organizer',
        email: 'missing-delete-organizer@example.com',
        role: UserRole.ORGANIZER,
      });

      const response = await request(app.getHttpServer())
        .delete('/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'EVENT_NOT_FOUND',
        path: '/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
      });
    });
  });

  describe('event registrations', () => {
    it('allows an attendee to register for a future event', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Registration Organizer',
        email: 'registration-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'Registration Attendee',
        email: 'registration-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(201);

      const body = response.body as EventRegistrationResponseBody;

      expect(body).toMatchObject({
        message: 'Event registration successful',
        event: {
          id: createdEvent.id,
          participantCount: 1,
        },
      });

      await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}`)
        .expect(200)
        .expect(({ body: eventBody }: { body: EventResponseBody }) => {
          expect(eventBody.participantCount).toBe(1);
          expect(eventBody).not.toHaveProperty('participantIds');
        });
    });

    it('rejects duplicate event registration', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Duplicate Registration Organizer',
        email: 'duplicate-registration-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'Duplicate Registration Attendee',
        email: 'duplicate-registration-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'EVENT_ALREADY_REGISTERED',
        message: 'You are already registered for this event',
        path: `/events/${createdEvent.id}/register`,
      });
    });

    it('rejects organizer use of the attendee registration endpoint', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Blocked Registration Organizer',
        email: 'blocked-registration-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ROLE',
        path: `/events/${createdEvent.id}/register`,
      });
    });

    it('returns 404 when registering for a missing event', async () => {
      const attendeeToken = await registerAndLogin({
        name: 'Missing Registration Attendee',
        email: 'missing-registration-attendee@example.com',
        role: UserRole.ATTENDEE,
      });

      const response = await request(app.getHttpServer())
        .post('/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9/register')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
        path: '/events/dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9/register',
      });
    });

    it('rejects registration for an event that has started or passed', async () => {
      const attendeeToken = await registerAndLogin({
        name: 'Past Registration Attendee',
        email: 'past-registration-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const pastEvent = await eventRepository.create(createPastEvent());

      const response = await request(app.getHttpServer())
        .post(`/events/${pastEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'EVENT_REGISTRATION_CLOSED',
        message:
          'Registration is closed for events that have started or passed',
        path: `/events/${pastEvent.id}/register`,
      });
    });

    it('ignores client-supplied attendee IDs and uses the authenticated user', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Body Ignored Organizer',
        email: 'body-ignored-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeLogin = await registerAndLoginWithUser({
        name: 'Body Ignored Attendee',
        email: 'body-ignored-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeLogin.accessToken}`)
        .send({
          attendeeId: 'dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
        })
        .expect(201);

      const storedEvent = await eventRepository.findById(createdEvent.id);

      expect(storedEvent?.participantIds).toEqual([attendeeLogin.user.id]);
    });

    it('allows an attendee to view their registered events', async () => {
      const organizerToken = await registerAndLogin({
        name: 'My Events Organizer',
        email: 'my-events-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'My Events Attendee',
        email: 'my-events-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/me/events')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      const body = response.body as EventResponseBody[];

      expect(body).toEqual([
        {
          ...createdEvent,
          participantCount: 1,
          updatedAt: expect.any(String) as string,
        },
      ]);
      expect(body[0]).not.toHaveProperty('participantIds');
    });

    it('allows an attendee to cancel registration', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Cancel Organizer',
        email: 'cancel-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'Cancel Attendee',
        email: 'cancel-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(204)
        .expect('');

      await request(app.getHttpServer())
        .get('/me/events')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200)
        .expect([]);

      await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}`)
        .expect(200)
        .expect(({ body }: { body: EventResponseBody }) => {
          expect(body.participantCount).toBe(0);
        });
    });

    it('rejects cancellation when the attendee is not registered', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Unregistered Organizer',
        email: 'unregistered-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'Unregistered Attendee',
        email: 'unregistered-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .delete(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'REGISTRATION_NOT_FOUND',
        message: 'You are not registered for this event',
        path: `/events/${createdEvent.id}/register`,
      });
    });

    it('allows the event owner to view safe participant details', async () => {
      const organizerLogin = await registerAndLoginWithUser({
        name: 'Participants Organizer',
        email: 'participants-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeLogin = await registerAndLoginWithUser({
        name: 'Participant Attendee',
        email: 'participant-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerLogin.accessToken);

      await request(app.getHttpServer())
        .post(`/events/${createdEvent.id}/register`)
        .set('Authorization', `Bearer ${attendeeLogin.accessToken}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}/participants`)
        .set('Authorization', `Bearer ${organizerLogin.accessToken}`)
        .expect(200);

      const body = response.body as Array<{
        id: string;
        name: string;
        email: string;
      }>;

      expect(body).toEqual([
        {
          id: attendeeLogin.user.id,
          name: 'Participant Attendee',
          email: 'participant-attendee@example.com',
        },
      ]);
      expect(body[0]).not.toHaveProperty('passwordHash');
    });

    it('rejects participant access from another organizer', async () => {
      const ownerToken = await registerAndLogin({
        name: 'Participants Owner',
        email: 'participants-owner@example.com',
        role: UserRole.ORGANIZER,
      });
      const otherOrganizerToken = await registerAndLogin({
        name: 'Participants Other',
        email: 'participants-other@example.com',
        role: UserRole.ORGANIZER,
      });
      const createdEvent = await createEvent(ownerToken);

      const response = await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}/participants`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'EVENT_OWNER_REQUIRED',
        message: 'Only the event organizer can modify this event',
        path: `/events/${createdEvent.id}/participants`,
      });
    });

    it('rejects attendee participant access', async () => {
      const organizerToken = await registerAndLogin({
        name: 'Participants Role Organizer',
        email: 'participants-role-organizer@example.com',
        role: UserRole.ORGANIZER,
      });
      const attendeeToken = await registerAndLogin({
        name: 'Participants Role Attendee',
        email: 'participants-role-attendee@example.com',
        role: UserRole.ATTENDEE,
      });
      const createdEvent = await createEvent(organizerToken);

      const response = await request(app.getHttpServer())
        .get(`/events/${createdEvent.id}/participants`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_ROLE',
        path: `/events/${createdEvent.id}/participants`,
      });
    });
  });

  async function registerAndLogin(input: {
    name: string;
    email: string;
    role: UserRole;
  }): Promise<string> {
    const loginBody = await registerAndLoginWithUser(input);

    return loginBody.accessToken;
  }

  async function registerAndLoginWithUser(input: {
    name: string;
    email: string;
    role: UserRole;
  }): Promise<LoginResponseBody> {
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

    return loginBody;
  }

  async function createEvent(accessToken: string): Promise<EventResponseBody> {
    const response = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Created Event',
        description: 'Created from a test helper',
        scheduledAt: futureIsoDate(),
      })
      .expect(201);

    return response.body as EventResponseBody;
  }

  function futureIsoDate(hoursFromNow = 1): string {
    return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
  }

  function createPastEvent(): Event {
    const now = new Date();

    return {
      id: 'aab44ad4-6faa-4087-a6d7-ac046067d8fe',
      title: 'Past Event',
      description: 'A past event seeded for registration tests',
      scheduledAt: new Date(Date.now() - 60 * 1000),
      organizerId: 'organizer-id',
      participantIds: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  afterEach(async () => {
    await app.close();
  });
});
