import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Event } from './domain/event';
import type { CreateEventDto } from './dto/create-event.dto';
import type { EventRepository } from './repositories/event.repository.interface';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let events: Event[];
  let repository: jest.Mocked<EventRepository>;
  let service: EventsService;

  const futureDate = (): string =>
    new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const createDto = (
    overrides: Partial<CreateEventDto> = {},
  ): CreateEventDto => ({
    title: 'Launch Meetup',
    description: 'A virtual launch event',
    scheduledAt: futureDate(),
    ...overrides,
  });

  beforeEach(() => {
    events = [];
    repository = {
      addParticipant: jest.fn(),
      create: jest.fn((event: Event) => {
        events.push(event);
        return Promise.resolve(cloneEvent(event));
      }),
      delete: jest.fn((id: string) => {
        events = events.filter((event) => event.id !== id);
        return Promise.resolve();
      }),
      findAll: jest.fn(() => Promise.resolve(events.map(cloneEvent))),
      findById: jest.fn((id: string) =>
        Promise.resolve(events.find((event) => event.id === id) ?? null),
      ),
      update: jest.fn((event: Event) => {
        events = events.map((storedEvent) =>
          storedEvent.id === event.id ? event : storedEvent,
        );
        return Promise.resolve(cloneEvent(event));
      }),
    };

    service = new EventsService(repository);
  });

  it('creates an event owned by the authenticated organizer', async () => {
    const response = await service.createEvent(
      createDto({
        title: '  Launch Meetup  ',
        description: '  A virtual launch event  ',
      }),
      'organizer-id',
    );

    expect(response).toMatchObject({
      id: expect.any(String) as string,
      title: 'Launch Meetup',
      description: 'A virtual launch event',
      organizerId: 'organizer-id',
      participantCount: 0,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    expect(response).not.toHaveProperty('participantIds');
    expect(events[0]).toMatchObject({
      organizerId: 'organizer-id',
      participantIds: [],
    });
  });

  it('rejects past event schedules', async () => {
    await expect(
      service.createEvent(
        createDto({
          scheduledAt: new Date(Date.now() - 60 * 1000).toISOString(),
        }),
        'organizer-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists events without exposing participant IDs', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');

    await expect(service.findAll()).resolves.toEqual([created]);
  });

  it('retrieves an event by ID', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');

    await expect(service.findById(created.id)).resolves.toEqual(created);
  });

  it('throws not found when an event does not exist', async () => {
    await expect(
      service.findById('dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an event owned by the authenticated organizer', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');
    const updatedSchedule = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const response = await service.updateEvent(
      created.id,
      {
        title: '  Updated title  ',
        scheduledAt: updatedSchedule.toISOString(),
      },
      'organizer-id',
    );

    expect(response).toMatchObject({
      id: created.id,
      title: 'Updated title',
      description: created.description,
      scheduledAt: updatedSchedule.toISOString(),
      organizerId: 'organizer-id',
    });
    expect(Date.parse(response.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.updatedAt),
    );
  });

  it('rejects empty event updates', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');

    await expect(
      service.updateEvent(created.id, {}, 'organizer-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects event updates from a non-owner organizer', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');

    await expect(
      service.updateEvent(
        created.id,
        {
          title: 'Blocked update',
        },
        'other-organizer-id',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws not found when updating a missing event', async () => {
    await expect(
      service.updateEvent(
        'dce1b31a-6f02-4c68-9ce6-a2de6ec93aa9',
        {
          title: 'Missing',
        },
        'organizer-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an event owned by the authenticated organizer', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');

    await service.deleteEvent(created.id, 'organizer-id');

    await expect(service.findById(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete.mock.calls).toContainEqual([created.id]);
  });

  it('rejects event deletion from a non-owner organizer', async () => {
    const created = await service.createEvent(createDto(), 'organizer-id');

    await expect(
      service.deleteEvent(created.id, 'other-organizer-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function cloneEvent(event: Event): Event {
  return {
    ...event,
    scheduledAt: new Date(event.scheduledAt),
    participantIds: [...event.participantIds],
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
  };
}
