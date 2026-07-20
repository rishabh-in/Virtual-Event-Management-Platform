import { UserRole } from '../../common/enums/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}
