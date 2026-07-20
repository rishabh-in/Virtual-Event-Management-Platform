import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateEventDto } from './dto/create-event.dto';
import { toEventResponse } from './dto/event-response.dto';
import type { EventResponseDto } from './dto/event-response.dto';
import type { Event } from './domain/event';
import { EVENT_REPOSITORY } from './repositories/event.repository.interface';
import type { EventRepository } from './repositories/event.repository.interface';

@Injectable()
export class EventsService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
  ) {}

  async createEvent(
    createEventDto: CreateEventDto,
    organizerId: string,
  ): Promise<EventResponseDto> {
    const scheduledAt = this.parseFutureScheduledAt(createEventDto.scheduledAt);
    const now = new Date();
    const event: Event = {
      id: randomUUID(),
      title: createEventDto.title.trim(),
      description: createEventDto.description.trim(),
      scheduledAt,
      organizerId,
      participantIds: [],
      createdAt: now,
      updatedAt: now,
    };

    return toEventResponse(await this.eventRepository.create(event));
  }

  async findAll(): Promise<EventResponseDto[]> {
    const events = await this.eventRepository.findAll();

    return events.map((event) => toEventResponse(event));
  }

  async findById(id: string): Promise<EventResponseDto> {
    const event = await this.eventRepository.findById(id);

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      });
    }

    return toEventResponse(event);
  }

  private parseFutureScheduledAt(scheduledAtInput: string): Date {
    const scheduledAt = new Date(scheduledAtInput);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_EVENT_SCHEDULE',
        message: 'scheduledAt must be a valid ISO 8601 date-time',
      });
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'EVENT_SCHEDULE_MUST_BE_FUTURE',
        message: 'Event must be scheduled in the future',
      });
    }

    return scheduledAt;
  }
}
