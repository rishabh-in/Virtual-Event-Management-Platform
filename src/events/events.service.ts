import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateEventDto } from './dto/create-event.dto';
import { toEventParticipantResponse } from './dto/event-participant-response.dto';
import type { EventParticipantResponseDto } from './dto/event-participant-response.dto';
import { toEventResponse } from './dto/event-response.dto';
import type { EventResponseDto } from './dto/event-response.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { Event } from './domain/event';
import { EVENT_REPOSITORY } from './repositories/event.repository.interface';
import type { EventRepository } from './repositories/event.repository.interface';
import { UsersService } from '../users/users.service';

@Injectable()
export class EventsService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    private readonly usersService: UsersService,
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
    const event = await this.getEventOrThrow(id);

    return toEventResponse(event);
  }

  async updateEvent(
    id: string,
    updateEventDto: UpdateEventDto,
    organizerId: string,
  ): Promise<EventResponseDto> {
    const hasEditableField = [
      updateEventDto.title,
      updateEventDto.description,
      updateEventDto.scheduledAt,
    ].some((value) => value !== undefined);

    if (!hasEditableField) {
      throw new BadRequestException({
        code: 'EVENT_UPDATE_EMPTY',
        message: 'At least one editable event field must be provided',
      });
    }

    const event = await this.getEventOrThrow(id);

    this.assertEventOwner(event, organizerId);

    const updatedEvent: Event = {
      ...event,
      title: updateEventDto.title?.trim() ?? event.title,
      description: updateEventDto.description?.trim() ?? event.description,
      scheduledAt: updateEventDto.scheduledAt
        ? this.parseFutureScheduledAt(updateEventDto.scheduledAt)
        : event.scheduledAt,
      updatedAt: new Date(),
    };

    return toEventResponse(await this.eventRepository.update(updatedEvent));
  }

  async deleteEvent(id: string, organizerId: string): Promise<void> {
    const event = await this.getEventOrThrow(id);

    this.assertEventOwner(event, organizerId);

    await this.eventRepository.delete(id);
  }

  async findParticipants(
    id: string,
    organizerId: string,
  ): Promise<EventParticipantResponseDto[]> {
    const event = await this.getEventOrThrow(id);

    this.assertEventOwner(event, organizerId);

    const participants = await this.usersService.findByIds(
      event.participantIds,
    );

    return participants.map((participant) =>
      toEventParticipantResponse(participant),
    );
  }

  private async getEventOrThrow(id: string): Promise<Event> {
    const event = await this.eventRepository.findById(id);

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      });
    }

    return event;
  }

  private assertEventOwner(event: Event, organizerId: string): void {
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException({
        code: 'EVENT_OWNER_REQUIRED',
        message: 'Only the event organizer can modify this event',
      });
    }
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
