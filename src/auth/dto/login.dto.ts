import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

const normalizeEmail = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value as unknown))
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
