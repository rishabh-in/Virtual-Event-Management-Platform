import type { User } from '../../users/domain/user';

export interface EventParticipantResponseDto {
  id: string;
  name: string;
  email: string;
}

export function toEventParticipantResponse(
  user: User,
): EventParticipantResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
