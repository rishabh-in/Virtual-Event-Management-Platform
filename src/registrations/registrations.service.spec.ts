import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Event } from '../events/domain/event';
import type {
  AddEventParticipantResult,
  EventRepository,
} from '../events/repositories/event.repository.interface';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsService', () => {
  let event: Event;
  let repository: jest.Mocked<EventRepository>;
  let service: RegistrationsService;

  beforeEach(() => {
    event = createEvent();
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

    service = new RegistrationsService(repository);
  });

  it('registers an attendee for a future event', async () => {
    const response = await service.registerForEvent(event.id, 'attendee-id');

    expect(response).toMatchObject({
      message: 'Event registration successful',
      event: {
        id: event.id,
        participantCount: 1,
      },
    });
    expect(repository.addParticipant.mock.calls).toContainEqual([
      event.id,
      'attendee-id',
    ]);
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
