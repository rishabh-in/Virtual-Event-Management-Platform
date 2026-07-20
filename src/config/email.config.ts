import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  from: process.env.EMAIL_FROM ?? 'no-reply@example.com',
  smtp: {
    host: process.env.SMTP_HOST,
    password: process.env.SMTP_PASSWORD,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
  },
  transport: process.env.EMAIL_TRANSPORT ?? 'json',
}));
