import { UserRole } from '../../common/enums/user-role.enum';

export interface LoginUserResponseDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponseDto {
  accessToken: string;
  user: LoginUserResponseDto;
}
