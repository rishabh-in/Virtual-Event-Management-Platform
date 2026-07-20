import { Module } from '@nestjs/common';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository';
import { USER_REPOSITORY } from './repositories/user.repository.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: USER_REPOSITORY,
      useClass: InMemoryUserRepository,
    },
  ],
  exports: [UsersService, USER_REPOSITORY],
})
export class UsersModule {}
