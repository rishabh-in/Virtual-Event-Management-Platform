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
