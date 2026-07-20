import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  @IsOptional()
  @Transform(({ value }) => emptyStringToUndefined(value as unknown))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_SALT_ROUNDS?: number;

  @IsOptional()
  @IsIn(['json', 'smtp'])
  EMAIL_TRANSPORT?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  SMTP_SECURE?: boolean;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  const nodeEnv = validatedConfig.NODE_ENV ?? 'development';

  if (nodeEnv === 'production' && !validatedConfig.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production');
  }

  if (validatedConfig.EMAIL_TRANSPORT === 'smtp') {
    const missingSmtpSettings = [
      ['SMTP_HOST', validatedConfig.SMTP_HOST],
      ['SMTP_PORT', validatedConfig.SMTP_PORT],
      ['SMTP_USER', validatedConfig.SMTP_USER],
      ['SMTP_PASSWORD', validatedConfig.SMTP_PASSWORD],
    ].filter(([, value]) => value === undefined || value === '');

    if (missingSmtpSettings.length > 0) {
      throw new Error(
        `Missing SMTP settings: ${missingSmtpSettings
          .map(([key]) => key)
          .join(', ')}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}

function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}
