export interface EventRegistrationEmailInput {
  attendeeEmail: string;
  attendeeName: string;
  eventTitle: string;
  scheduledAt: Date;
}

export interface EmailService {
  sendEventRegistrationConfirmation(
    input: EventRegistrationEmailInput,
  ): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
