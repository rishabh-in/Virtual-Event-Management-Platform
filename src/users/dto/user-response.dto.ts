import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../domain/user';

export interface UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
