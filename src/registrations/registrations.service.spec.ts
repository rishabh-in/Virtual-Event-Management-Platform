import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Event } from '../events/domain/event';
import type {
  AddEventParticipantResult,
  EventRepository,
} from '../events/repositories/event.repository.interface';
import type { EmailService } from '../email/email.interface';
import { UserRole } from '../common/enums/user-role.enum';
import type { User } from '../users/domain/user';
import type { UsersService } from '../users/users.service';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsService', () => {
  let attendee: User;
  let emailService: jest.Mocked<EmailService>;
  let event: Event;
  let repository: jest.Mocked<EventRepository>;
  let service: RegistrationsService;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    attendee = {
      id: 'attendee-id',
      name: 'Attendee User',
      email: 'attendee@example.com',
      passwordHash: 'hashed-password',
      role: UserRole.ATTENDEE,
      createdAt: new Date(),
    };
    event = createEvent();
    emailService = {
      sendEventRegistrationConfirmation: jest.fn(() => Promise.resolve()),
    };
    repository = {
      addParticipant: jest.fn((eventId: string, participantId: string) =>
        Promise.resolve(addParticipant(eventId, participantId)),
      ),
      create: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn((id: string) =>
        Promise.resolve(id === event.id ? cloneEvent(event) : null),
      ),
      findByParticipantId: jest.fn((participantId: string) =>
        Promise.resolve(
          event.participantIds.includes(participantId)
            ? [cloneEvent(event)]
            : [],
        ),
      ),
      removeParticipant: jest.fn((eventId: string, participantId: string) => {
        if (eventId !== event.id) {
          return Promise.resolve({
            status: 'event_not_found',
          });
        }

        if (!event.participantIds.includes(participantId)) {
          return Promise.resolve({
            status: 'participant_not_found',
          });
        }

        event = {
          ...event,
          participantIds: event.participantIds.filter(
            (id) => id !== participantId,
          ),
          updatedAt: new Date(),
        };

        return Promise.resolve({
          status: 'removed',
          event: cloneEvent(event),
        });
      }),
      update: jest.fn(),
    };
    usersService = {
      findById: jest.fn((id: string) =>
        Promise.resolve(id === attendee.id ? attendee : null),
      ),
    };

    service = new RegistrationsService(
      repository,
      emailService,
      usersService as UsersService,
    );
  });

  it('registers an attendee for a future event', async () => {
    const response = await service.registerForEvent(event.id, 'attendee-id');

    expect(response).toMatchObject({
      message: 'Event registration successful',
      emailNotificationSent: true,
      event: {
        id: event.id,
        participantCount: 1,
      },
    });
    expect(repository.addParticipant.mock.calls).toContainEqual([
      event.id,
      'attendee-id',
    ]);
    expect(emailService.sendEventRegistrationConfirmation.mock.calls).toEqual([
      [
        {
          attendeeEmail: attendee.email,
          attendeeName: attendee.name,
          eventTitle: event.title,
          scheduledAt: event.scheduledAt,
        },
      ],
    ]);
  });

  it('reports email failure without undoing registration', async () => {
    emailService.sendEventRegistrationConfirmation.mockRejectedValueOnce(
      new Error('Email provider unavailable'),
    );

    const response = await service.registerForEvent(event.id, attendee.id);

    expect(response.emailNotificationSent).toBe(false);
    expect(event.participantIds).toEqual([attendee.id]);
  });

  it('rejects duplicate registration', async () => {
    await service.registerForEvent(event.id, 'attendee-id');

    await expect(
      service.registerForEvent(event.id, 'attendee-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when the event does not exist', async () => {
    await expect(
      service.registerForEvent(
        '4fbc55d6-cd2f-4e7d-a4d9-f60454575e4c',
        'attendee-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects registration for an event that has started or passed', async () => {
    event = createEvent({
      scheduledAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(
      service.registerForEvent(event.id, 'attendee-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.addParticipant.mock.calls).toHaveLength(0);
  });

  it('returns events registered by an attendee', async () => {
    await service.registerForEvent(event.id, 'attendee-id');

    await expect(service.findRegisteredEvents('attendee-id')).resolves.toEqual([
      expect.objectContaining({
        id: event.id,
        participantCount: 1,
      }),
    ]);
  });

  it('cancels an existing registration', async () => {
    await service.registerForEvent(event.id, 'attendee-id');

    await service.cancelRegistration(event.id, 'attendee-id');

    expect(event.participantIds).toEqual([]);
  });

  it('throws not found when cancelling a missing registration', async () => {
    await expect(
      service.cancelRegistration(event.id, 'attendee-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  function addParticipant(
    eventId: string,
    participantId: string,
  ): AddEventParticipantResult {
    if (eventId !== event.id) {
      return {
        status: 'event_not_found',
      };
    }

    if (event.participantIds.includes(participantId)) {
      return {
        status: 'duplicate_participant',
      };
    }

    event = {
      ...event,
      participantIds: [...event.participantIds, participantId],
      updatedAt: new Date(),
    };

    return {
      status: 'registered',
      event: cloneEvent(event),
    };
  }
});

function createEvent(overrides: Partial<Event> = {}): Event {
  const now = new Date();

  return {
    id: 'dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
    title: 'Event',
    description: 'A test event',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    organizerId: 'organizer-id',
    participantIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function cloneEvent(event: Event): Event {
  return {
    ...event,
    scheduledAt: new Date(event.scheduledAt),
    participantIds: [...event.participantIds],
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
  };
}
