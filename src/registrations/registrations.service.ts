import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toEventResponse } from '../events/dto/event-response.dto';
import type { EventResponseDto } from '../events/dto/event-response.dto';
import { EVENT_REPOSITORY } from '../events/repositories/event.repository.interface';
import type { EventRepository } from '../events/repositories/event.repository.interface';
import type { EventRegistrationResponseDto } from './dto/event-registration-response.dto';

@Injectable()
export class RegistrationsService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
  ) {}

  async registerForEvent(
    eventId: string,
    attendeeId: string,
  ): Promise<EventRegistrationResponseDto> {
    const event = await this.eventRepository.findById(eventId);

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      });
    }

    if (event.scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'EVENT_REGISTRATION_CLOSED',
        message:
          'Registration is closed for events that have started or passed',
      });
    }

    const result = await this.eventRepository.addParticipant(
      eventId,
      attendeeId,
    );

    if (result.status === 'event_not_found') {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      });
    }

    if (result.status === 'duplicate_participant') {
      throw new ConflictException({
        code: 'EVENT_ALREADY_REGISTERED',
        message: 'You are already registered for this event',
      });
    }

    return {
      message: 'Event registration successful',
      event: toEventResponse(result.event),
    };
  }

  async findRegisteredEvents(attendeeId: string): Promise<EventResponseDto[]> {
    const events = await this.eventRepository.findByParticipantId(attendeeId);

    return events.map((event) => toEventResponse(event));
  }

  async cancelRegistration(eventId: string, attendeeId: string): Promise<void> {
    const result = await this.eventRepository.removeParticipant(
      eventId,
      attendeeId,
    );

    if (result.status === 'event_not_found') {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      });
    }

    if (result.status === 'participant_not_found') {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'You are not registered for this event',
      });
    }
  }
}
