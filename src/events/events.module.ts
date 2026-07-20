import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { InMemoryEventRepository } from './repositories/in-memory-event.repository';
import { EVENT_REPOSITORY } from './repositories/event.repository.interface';

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    {
      provide: EVENT_REPOSITORY,
      useClass: InMemoryEventRepository,
    },
  ],
  exports: [EventsService, EVENT_REPOSITORY],
})
export class EventsModule {}
