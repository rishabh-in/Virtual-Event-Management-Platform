import { Injectable } from '@nestjs/common';
import type { Event } from '../domain/event';
import type { EventRepository } from './event.repository.interface';

@Injectable()
export class InMemoryEventRepository implements EventRepository {
  private readonly eventsById = new Map<string, Event>();

  create(event: Event): Promise<Event> {
    const storedEvent = this.cloneEvent(event);

    this.eventsById.set(storedEvent.id, storedEvent);

    return Promise.resolve(this.cloneEvent(storedEvent));
  }

  findAll(): Promise<Event[]> {
    return Promise.resolve(
      Array.from(this.eventsById.values()).map((event) =>
        this.cloneEvent(event),
      ),
    );
  }

  findById(id: string): Promise<Event | null> {
    const event = this.eventsById.get(id);

    return Promise.resolve(event ? this.cloneEvent(event) : null);
  }

  clear(): void {
    this.eventsById.clear();
  }

  private cloneEvent(event: Event): Event {
    return {
      ...event,
      scheduledAt: new Date(event.scheduledAt),
      participantIds: [...event.participantIds],
      createdAt: new Date(event.createdAt),
      updatedAt: new Date(event.updatedAt),
    };
  }
}
