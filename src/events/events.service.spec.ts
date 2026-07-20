import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      create: jest.fn((event: Event) => {
        events.push(event);
        return Promise.resolve(cloneEvent(event));
      }),
      findAll: jest.fn(() => Promise.resolve(events.map(cloneEvent))),
      findById: jest.fn((id: string) =>
        Promise.resolve(events.find((event) => event.id === id) ?? null),
      ),
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
