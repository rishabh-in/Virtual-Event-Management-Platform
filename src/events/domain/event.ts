export interface Event {
  id: string;
  title: string;
  description: string;
  scheduledAt: Date;
  organizerId: string;
  participantIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
