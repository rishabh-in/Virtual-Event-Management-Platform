import { Transform } from 'class-transformer';
import { IsISO8601, IsString, MinLength } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEventDto {
  @Transform(({ value }) => trimString(value as unknown))
  @IsString()
  @MinLength(1)
  title!: string;

  @Transform(({ value }) => trimString(value as unknown))
  @IsString()
  @MinLength(1)
  description!: string;

  @IsISO8601({ strict: true })
  scheduledAt!: string;
}
