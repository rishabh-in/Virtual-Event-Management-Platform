import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterUserDto {
  @Transform(({ value }) => trimString(value as unknown))
  @IsString()
  @MinLength(2)
  name!: string;

  @Transform(({ value }) => normalizeEmail(value as unknown))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
