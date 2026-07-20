import type { Event } from '../domain/event';

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

export interface EventRepository {
  create(event: Event): Promise<Event>;
  findAll(): Promise<Event[]>;
  findById(id: string): Promise<Event | null>;
}
