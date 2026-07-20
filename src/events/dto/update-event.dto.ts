import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateEventDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value as unknown))
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value as unknown))
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;
}
