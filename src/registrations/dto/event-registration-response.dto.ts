import type { EventResponseDto } from '../../events/dto/event-response.dto';

export interface EventRegistrationResponseDto {
  message: string;
  emailNotificationSent: boolean;
  event: EventResponseDto;
}
