import type { Event } from '../domain/event';

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

export type AddEventParticipantResult =
  | {
      status: 'registered';
      event: Event;
    }
  | {
      status: 'event_not_found';
    }
  | {
      status: 'duplicate_participant';
    };

export type RemoveEventParticipantResult =
  | {
      status: 'removed';
      event: Event;
    }
  | {
      status: 'event_not_found';
    }
  | {
      status: 'participant_not_found';
    };

export interface EventRepository {
  addParticipant(
    eventId: string,
    participantId: string,
  ): Promise<AddEventParticipantResult>;
  create(event: Event): Promise<Event>;
  delete(id: string): Promise<void>;
  findAll(): Promise<Event[]>;
  findById(id: string): Promise<Event | null>;
  findByParticipantId(participantId: string): Promise<Event[]>;
  removeParticipant(
    eventId: string,
    participantId: string,
  ): Promise<RemoveEventParticipantResult>;
  update(event: Event): Promise<Event>;
}
