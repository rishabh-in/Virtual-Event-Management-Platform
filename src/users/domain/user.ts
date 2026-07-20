import { UserRole } from '../../common/enums/user-role.enum';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}
