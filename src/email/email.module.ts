import { Module } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.interface';
import { NodemailerEmailService } from './nodemailer-email.service';

@Module({
  providers: [
    {
      provide: EMAIL_SERVICE,
      useClass: NodemailerEmailService,
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
