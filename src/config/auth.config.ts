import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 10),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  jwtSecret: process.env.JWT_SECRET,
}));
