import type { Event } from '../domain/event';

export interface EventResponseDto {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  organizerId: string;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toEventResponse(event: Event): EventResponseDto {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    scheduledAt: event.scheduledAt.toISOString(),
    organizerId: event.organizerId,
    participantCount: event.participantIds.length,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
