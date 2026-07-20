import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EMAIL_SERVICE } from '../email/email.interface';
import type { EmailService } from '../email/email.interface';
import { toEventResponse } from '../events/dto/event-response.dto';
import type { EventResponseDto } from '../events/dto/event-response.dto';
import { EVENT_REPOSITORY } from '../events/repositories/event.repository.interface';
import type { EventRepository } from '../events/repositories/event.repository.interface';
import { UsersService } from '../users/users.service';
import type { EventRegistrationResponseDto } from './dto/event-registration-response.dto';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly eventRepository: EventRepository,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
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

    const attendee = await this.usersService.findById(attendeeId);
    const emailNotificationSent = attendee
      ? await this.sendRegistrationConfirmation({
          attendeeEmail: attendee.email,
          attendeeName: attendee.name,
          eventTitle: result.event.title,
          scheduledAt: result.event.scheduledAt,
        })
      : false;

    return {
      message: 'Event registration successful',
      emailNotificationSent,
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

  private async sendRegistrationConfirmation(input: {
    attendeeEmail: string;
    attendeeName: string;
    eventTitle: string;
    scheduledAt: Date;
  }): Promise<boolean> {
    try {
      await this.emailService.sendEventRegistrationConfirmation(input);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send registration confirmation email: ${this.getErrorMessage(
          error,
        )}`,
      );
      return false;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown email delivery error';
  }
}
