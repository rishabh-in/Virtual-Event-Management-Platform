import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type JSONTransport from 'nodemailer/lib/json-transport';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type {
  EmailService,
  EventRegistrationEmailInput,
} from './email.interface';

@Injectable()
export class NodemailerEmailService implements EmailService {
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport(
      this.createTransportOptions(),
    );
  }

  async sendEventRegistrationConfirmation(
    input: EventRegistrationEmailInput,
  ): Promise<void> {
    const scheduledAt = input.scheduledAt.toISOString();

    await this.transporter.sendMail({
      from: this.configService.getOrThrow<string>('email.from'),
      to: input.attendeeEmail,
      subject: `Registration confirmed: ${input.eventTitle}`,
      text: [
        `Hello ${input.attendeeName},`,
        '',
        `Your registration for ${input.eventTitle} is confirmed.`,
        `Scheduled at: ${scheduledAt}`,
      ].join('\n'),
    });
  }

  private createTransportOptions():
    JSONTransport.Options | SMTPTransport.Options {
    const transport =
      this.configService.get<string>('email.transport') ?? 'json';

    if (transport === 'smtp') {
      return {
        host: this.configService.getOrThrow<string>('email.smtp.host'),
        port: this.configService.getOrThrow<number>('email.smtp.port'),
        secure: this.configService.get<boolean>('email.smtp.secure') ?? false,
        auth: {
          user: this.configService.getOrThrow<string>('email.smtp.user'),
          pass: this.configService.getOrThrow<string>('email.smtp.password'),
        },
      };
    }

    return {
      jsonTransport: true,
    };
  }
}
